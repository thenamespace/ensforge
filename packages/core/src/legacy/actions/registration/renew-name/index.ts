import { Effect } from "effect";

import { erc20AllowanceAbi } from "@ensforge/contracts/internal";
import { keccak256, stringToHex } from "viem";

import { defineExtendedAction } from "../../../action/action.js";
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
import { approveRenewalPayment, makeRenewalIntent } from "../renewal-mutation.js";
import type {
  RenewNameAction,
  RenewNameParameters,
  RenewNameResult,
  RenewalPriceResult,
} from "../types.js";

const confirmed = { type: "confirmed" } as const;

const requireQuote = (
  quote: RenewalPriceResult,
): Effect.Effect<Extract<RenewalPriceResult, { status: "renewable" }>, RenewalError> => {
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

const planId = (name: string, parameters: RenewNameParameters) =>
  `renewName:${keccak256(
    stringToHex(
      JSON.stringify({
        name,
        duration: parameters.duration.toString(),
        paymentToken: parameters.paymentToken ?? null,
        maxPrice: parameters.maxPrice?.toString() ?? null,
        referrer: parameters.referrer ?? null,
      }),
    ),
  )}`;

const renewNameEffect = Effect.fn("ensforge.renewName")(function* (
  config: EnsforgeConfig,
  parameters: RenewNameParameters,
): Effect.fn.Return<RenewNameResult, WriteError> {
  const name = yield* normalizeName.effect(parameters.name);
  const id = planId(name, parameters);

  if (
    parameters.resume?.write.status === "completed" &&
    parameters.resume.write.completedStages.some((stage) => stage.id === "renew")
  ) {
    if (parameters.resume.write.planId !== id) {
      return yield* new RenewalError({
        code: "ROUTE_CHANGED",
        message: "Renewal resume data does not match the supplied renewal",
      });
    }

    const [expiry, finalState] = yield* Effect.all(
      [getExpiry.effect(config, { name }), getNameState.effect(config, { name })] as const,
      { concurrency: "unbounded" },
    );

    return { ...parameters.resume, newExpiry: expiry?.expiry ?? null, finalState };
  }

  const [priceResult, currentExpiry] = yield* Effect.all(
    [
      getRenewalPrice.effect(config, {
        name,
        duration: parameters.duration,
        ...(parameters.paymentToken === undefined ? {} : { paymentToken: parameters.paymentToken }),
      }),
      getExpiry.effect(config, { name }),
    ] as const,
    { concurrency: "unbounded" },
  );

  const quote = yield* requireQuote(priceResult);

  if (parameters.resume !== undefined && parameters.resume.route !== quote.route) {
    return yield* new RenewalError({
      code: "ROUTE_CHANGED",
      message: `The renewal route for ${name} changed while resuming`,
    });
  }

  if (parameters.maxPrice !== undefined && quote.price > parameters.maxPrice) {
    return yield* new RenewalError({
      code: "PRICE_EXCEEDS_MAXIMUM",
      message: `The current renewal price for ${name} exceeds maxPrice`,
    });
  }

  let approval = parameters.resume?.approval ?? {
    required: false,
    spender: null,
    token: null,
    amount: 0n,
  };

  if (quote.currency.kind === "erc20" && !approval.required) {
    const currency = quote.currency;
    const { account } = yield* provideConfig(config, resolveWalletContext(parameters));
    const payer = typeof account === "string" ? account : account.address;

    const allowance = yield* Effect.tryPromise({
      try: () =>
        config.publicClient.readContract({
          address: currency.address,
          abi: erc20AllowanceAbi,
          functionName: "allowance",
          args: [payer, quote.renewer],
        }),
      catch: (cause) => viemErrorToEffectError(cause, "readContract"),
    });

    if (allowance < quote.price) {
      approval = {
        required: true,
        spender: quote.renewer,
        token: currency.address,
        amount: parameters.maxPrice ?? quote.price,
      };
    }
  }

  const stages: Array<WritePlan["stages"][number]> = [];

  if (approval.required && approval.token !== null) {
    stages.push({
      type: "calls",
      id: "approve-payment",
      calls: [
        approveRenewalPayment.call({
          name,
          duration: parameters.duration,
          paymentToken: approval.token,
          amount: approval.amount,
        }),
      ],
      mode: "sequential",
      atomicity: "none",
      confirmation: confirmed,
    });
  }

  stages.push({
    type: "calls",
    id: "renew",
    calls: [makeRenewalIntent(parameters)],
    mode: "sequential",
    atomicity: "none",
    confirmation: parameters.confirmation ?? confirmed,
  });

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
          : new RenewalError({ code: "RENEWAL_FAILED", message: `Unable to renew ${name}` }),
      ),
    );

  const completed = write.status === "completed";

  const [newExpiry, finalState] = completed
    ? yield* Effect.all(
        [getExpiry.effect(config, { name }), getNameState.effect(config, { name })] as const,
        { concurrency: "unbounded" },
      )
    : ([null, null] as const);

  return {
    status: write.status === "completed" ? "completed" : "partial",
    name,
    protocol: quote.protocol,
    route: quote.route,
    duration: parameters.duration,
    previousExpiry: parameters.resume?.previousExpiry ?? currentExpiry?.expiry ?? null,
    newExpiry: newExpiry?.expiry ?? null,
    price: quote.price,
    currency: quote.currency,
    approval,
    write,
    finalState,
  };
});

const action = defineExtendedAction<RenewNameParameters, RenewNameResult, WriteError>(
  withWorkflow("renewName", renewNameEffect),
);

export const renewName = Object.freeze(
  Object.defineProperty(action, "call", {
    value: makeRenewalIntent,
    enumerable: true,
    configurable: false,
    writable: false,
  }),
) as RenewNameAction;

export type { RenewNameAction, RenewNameParameters, RenewNameResult } from "../types.js";
