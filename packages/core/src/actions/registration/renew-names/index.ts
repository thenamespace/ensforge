import { Effect } from "effect";

import { erc20AllowanceAbi } from "@ensforge/contracts/internal";
import { keccak256, stringToHex } from "viem";

import { defineAction } from "../../../action/action.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { RenewalError } from "../../../errors/renewal-error.js";
import { provideConfig } from "../../../internal/config/context.js";
import { viemErrorToEffectError } from "../../../internal/errors/viem-error.js";
import { resolveWalletContext } from "../../../internal/services/wallet-client.js";
import { withWorkflow } from "../../../internal/workflows/run.js";
import { normalizeName } from "../../../names/normalize.js";
import type { WriteError, WritePlan } from "../../../write/types.js";
import { executeWritePlan } from "../../batch/execute-write-plan.js";
import { getExpiry } from "../../name/get-expiry/index.js";
import { getNameState } from "../../name/get-name-state/index.js";
import { getRenewalPrice } from "../get-renewal-price/index.js";
import {
  approveRenewalPayment,
  makeRenewalBatchIntent,
  makeRenewalIntent,
  supportsContractRenewalBatch,
} from "../renewal-mutation.js";
import type {
  RenewNamesParameters,
  RenewNamesResult,
  RenewalApproval,
  RenewalPriceResult,
} from "../types.js";

const confirmed = { type: "confirmed" } as const;

type Quote = Extract<RenewalPriceResult, { status: "renewable" }>;

type Entry = {
  readonly index: number;
  readonly parameters: RenewNamesParameters["renewals"][number];
  readonly name: string;
  readonly quote: Quote;
  readonly previousExpiry: bigint | null;
};

const planId = (parameters: RenewNamesParameters, names: ReadonlyArray<string>) =>
  `renewNames:${keccak256(
    stringToHex(
      JSON.stringify(
        {
          renewals: parameters.renewals.map((renewal, index) => ({
            ...renewal,
            name: names[index] ?? renewal.name,
          })),
          maxTotalPrice: parameters.maxTotalPrice ?? null,
        },
        (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value),
      ),
    ),
  )}`;

const requireQuote = (quote: RenewalPriceResult): Effect.Effect<Quote, RenewalError> => {
  switch (quote.status) {
    case "not-renewable":
      return new RenewalError({
        code: "NAME_NOT_RENEWABLE",
        message: `${quote.name} is not renewable`,
      });
    case "payment-token-required":
      return new RenewalError({
        code: "PAYMENT_TOKEN_REQUIRED",
        message: `A payment token is required to renew ${quote.name}`,
      });
    case "unsupported-payment-token":
      return new RenewalError({
        code: "PAYMENT_TOKEN_UNSUPPORTED",
        message: `The selected payment token is not supported for ${quote.name}`,
      });
    default:
      return Effect.succeed(quote);
  }
};

const renewNamesEffect = Effect.fn("ensforge.renewNames")(function* (
  config: EnsforgeConfig,
  parameters: RenewNamesParameters,
): Effect.fn.Return<RenewNamesResult, WriteError> {
  if (parameters.renewals.length === 0) {
    return yield* new RenewalError({
      code: "RENEWAL_FAILED",
      message: "renewNames requires at least one renewal",
    });
  }

  const names = yield* Effect.forEach(parameters.renewals, (renewal) =>
    normalizeName.effect(renewal.name),
  );

  if (new Set(names).size !== names.length) {
    return yield* new RenewalError({
      code: "RENEWAL_FAILED",
      message: "renewNames cannot contain duplicate names",
    });
  }

  const id = planId(parameters, names);

  if (parameters.resume?.write.status === "completed") {
    if (parameters.resume.write.planId !== id) {
      return yield* new RenewalError({
        code: "ROUTE_CHANGED",
        message: "Renewal resume data does not match the supplied renewals",
      });
    }

    const renewals = yield* Effect.forEach(parameters.resume.renewals, (renewal) =>
      Effect.all(
        [
          getExpiry.effect(config, { name: renewal.name }),
          getNameState.effect(config, { name: renewal.name }),
        ] as const,
        { concurrency: "unbounded" },
      ).pipe(
        Effect.map(([expiry, finalState]) => ({
          ...renewal,
          newExpiry: expiry?.expiry ?? null,
          finalState,
        })),
      ),
    );

    return { ...parameters.resume, renewals };
  }

  const entries = yield* Effect.forEach(
    parameters.renewals,
    (renewal, index) =>
      Effect.all(
        [
          getRenewalPrice
            .effect(config, {
              name: names[index] ?? renewal.name,
              duration: renewal.duration,
              ...(renewal.paymentToken === undefined ? {} : { paymentToken: renewal.paymentToken }),
            })
            .pipe(Effect.flatMap(requireQuote)),
          getExpiry.effect(config, { name: names[index] ?? renewal.name }),
        ] as const,
        { concurrency: "unbounded" },
      ).pipe(
        Effect.map(([quote, expiry]): Entry => ({
          index,
          parameters: renewal,
          name: names[index] ?? renewal.name,
          quote,
          previousExpiry:
            parameters.resume?.renewals[index]?.previousExpiry ?? expiry?.expiry ?? null,
        })),
      ),
    { concurrency: config.reads.concurrency },
  );

  for (const entry of entries) {
    if (entry.parameters.maxPrice !== undefined && entry.quote.price > entry.parameters.maxPrice) {
      return yield* new RenewalError({
        code: "PRICE_EXCEEDS_MAXIMUM",
        message: `The current renewal price for ${entry.name} exceeds maxPrice`,
      });
    }
  }

  const totalPrice = entries.reduce((sum, entry) => sum + entry.quote.price, 0n);

  if (parameters.maxTotalPrice !== undefined && totalPrice > parameters.maxTotalPrice) {
    return yield* new RenewalError({
      code: "TOTAL_PRICE_EXCEEDS_MAXIMUM",
      message: "The current renewal price exceeds maxTotalPrice",
    });
  }

  const grouped = new Map<string, Array<Entry>>();

  for (const entry of entries) {
    const token = entry.quote.currency.kind === "erc20" ? entry.quote.currency.address : "native";

    const v1Arguments =
      entry.quote.route === "v1-controller"
        ? `${entry.parameters.duration}:${entry.parameters.referrer ?? "default"}`
        : "mixed";

    const key = `${entry.quote.route}:${entry.quote.renewer}:${token}:${v1Arguments}`;

    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }

  const { account } = yield* provideConfig(config, resolveWalletContext(parameters));
  const payer = typeof account === "string" ? account : account.address;
  const stages: Array<WritePlan["stages"][number]> = [];
  const approvals: Array<RenewalApproval> = [];
  let groupIndex = 0;

  for (const group of grouped.values()) {
    const first = group[0];

    if (first === undefined) continue;

    const renewalStageId = `renew-group-${groupIndex}`;

    const groupCompleted = parameters.resume?.write.completedStages.some(
      (stage) => stage.id === renewalStageId,
    );

    let approval = parameters.resume?.approvals.find(
      (candidate) =>
        candidate.spender === first.quote.renewer &&
        candidate.token ===
          (first.quote.currency.kind === "erc20" ? first.quote.currency.address : null),
    );

    if (first.quote.currency.kind === "erc20" && approval === undefined && !groupCompleted) {
      const currency = first.quote.currency;

      const allowance = yield* Effect.tryPromise({
        try: () =>
          config.publicClient.readContract({
            address: currency.address,
            abi: erc20AllowanceAbi,
            functionName: "allowance",
            args: [payer, first.quote.renewer],
          }),
        catch: (cause) => viemErrorToEffectError(cause, "readContract"),
      });

      const groupPrice = group.reduce((sum, entry) => sum + entry.quote.price, 0n);

      approval = {
        required: allowance < groupPrice,
        spender: first.quote.renewer,
        token: currency.address,
        amount: group.reduce(
          (sum, entry) => sum + (entry.parameters.maxPrice ?? entry.quote.price),
          0n,
        ),
      };
    }

    if (approval !== undefined) approvals.push(approval);

    if (approval?.required && approval.token !== null) {
      stages.push({
        type: "calls",
        id: `approve-group-${groupIndex}`,
        calls: [
          approveRenewalPayment.call({
            name: first.name,
            duration: first.parameters.duration,
            paymentToken: approval.token,
            amount: approval.amount,
          }),
        ],
        mode: "sequential",
        atomicity: "none",
        confirmation: confirmed,
      });
    }

    const contractBatch = supportsContractRenewalBatch(first.quote.route);

    stages.push({
      type: "calls",
      id: renewalStageId,
      calls: contractBatch
        ? [
            makeRenewalBatchIntent({
              renewals: group.map((entry) => entry.parameters),
              ...(parameters.maxTotalPrice === undefined
                ? {}
                : { maxTotalPrice: parameters.maxTotalPrice }),
            }),
          ]
        : group.map((entry) => makeRenewalIntent(entry.parameters)),
      mode: contractBatch ? "sequential" : (parameters.mode ?? "auto"),
      atomicity: contractBatch || group.length === 1 ? "none" : "preferred",
      confirmation: parameters.confirmation ?? confirmed,
    });

    groupIndex += 1;
  }

  const write = yield* executeWritePlan
    .effect(config, {
      plan: { id, stages },
      ...(parameters.resume === undefined ? {} : { resume: parameters.resume.write }),
      ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
      ...(parameters.account === undefined ? {} : { account: parameters.account }),
    })
    .pipe(
      Effect.mapError((error) =>
        error instanceof RenewalError
          ? error
          : new RenewalError({ code: "RENEWAL_FAILED", message: "Unable to renew names" }),
      ),
    );

  const completedIds = new Set(write.completedStages.map((stage) => stage.id));

  const renewals = yield* Effect.forEach(
    entries,
    Effect.fn("ensforge.renewNames.result")(function* (entry) {
      const containingGroup = [...grouped.values()].findIndex((group) => group.includes(entry));
      const group = [...grouped.values()][containingGroup];
      const stageId = `renew-group-${containingGroup}`;
      const stage = write.completedStages.find((candidate) => candidate.id === stageId);
      const entryCall = group?.findIndex((candidate) => candidate === entry) ?? -1;

      const callResult =
        stage?.result.mode === "sequential" && entryCall >= 0
          ? stage.result.calls[entryCall]
          : undefined;

      const completed =
        completedIds.has(stageId) ||
        (group !== undefined &&
          !supportsContractRenewalBatch(entry.quote.route) &&
          callResult !== undefined &&
          callResult.status !== "not-started");

      if (!completed) {
        return {
          name: entry.quote.name,
          protocol: entry.quote.protocol,
          route: entry.quote.route,
          duration: entry.parameters.duration,
          previousExpiry: entry.previousExpiry,
          newExpiry: null,
          price: entry.quote.price,
          currency: entry.quote.currency,
          finalState: null,
        } satisfies RenewNamesResult["renewals"][number];
      }

      const [expiry, finalState] = yield* Effect.all(
        [
          getExpiry.effect(config, { name: entry.name }),
          getNameState.effect(config, { name: entry.name }),
        ] as const,
        { concurrency: "unbounded" },
      );

      return {
        name: entry.quote.name,
        protocol: entry.quote.protocol,
        route: entry.quote.route,
        duration: entry.parameters.duration,
        previousExpiry: entry.previousExpiry,
        newExpiry: expiry?.expiry ?? null,
        price: entry.quote.price,
        currency: entry.quote.currency,
        finalState,
      } satisfies RenewNamesResult["renewals"][number];
    }),
  );

  return {
    status: write.status === "completed" ? "completed" : "partial",
    renewals,
    approvals,
    totalPrice,
    write,
  };
});

export const renewNames = defineAction<RenewNamesParameters, RenewNamesResult, WriteError>(
  withWorkflow("renewNames", renewNamesEffect),
);

export type { RenewNamesParameters, RenewNamesResult } from "../types.js";
