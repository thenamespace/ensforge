import { Effect, Array as Arr } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, isAddressEqual, type Address } from "viem";

import type { Client } from "../../../client/types.js";
import { ConfigError } from "../../../errors/classes/ConfigError.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { NameStateError } from "../../../errors/classes/NameStateError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { addressOf } from "../../../internal/address.js";
import { requireRegistrationContracts } from "../../../internal/registration/contracts.js";
import { requireDuration } from "../../../internal/registration/duration.js";
import { renewedNames } from "../../../internal/registration/events.js";
import { normalizedWarnings, parseEthNames } from "../../../internal/registration/labels.js";
import { paymentCalls, paymentTokenAddress } from "../../../internal/registration/payment.js";
import { referrerOf } from "../../../internal/registration/referrer.js";
import { quoteRenewals, type RenewalQuote } from "../../../internal/registration/renewal.js";
import * as Rpc from "../../../internal/rpc/index.js";
import { routeSender } from "../../../internal/write/via.js";
import { make as makePlan } from "../../../plan/make.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { renew as Promises, renewSync as SyncPromises } from "./index.js";

/** The renew call of one route: `renew` for one name, `renewBatch` for several. */
const renewCall = (
  spender: Address,
  quotes: readonly RenewalQuote[],
  options: { readonly token: Address; readonly referrer: `0x${string}` },
): Plan.Call => {
  const data = Arr.map(quotes, (quote) => ({
    label: quote.label,
    duration: quote.duration,
    referrer: options.referrer,
  }));
  const [single] = data;

  return {
    to: spender,
    data:
      data.length === 1 && single !== undefined
        ? encodeFunctionData({
            abi: Abis.v2.ethRegistrar,
            functionName: "renew",
            args: [single, options.token],
          })
        : encodeFunctionData({
            abi: Abis.v2.ethRegistrar,
            functionName: "renewBatch",
            args: [data, options.token],
          }),
    value: 0n,
  };
};

/** @internal Builds the plan of `Actions.registration.renew`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account" | "via">,
): Effect.fn.Return<Plan, AnyError> {
  const signer = addressOf(options.account) ?? client.account;
  if (signer === undefined) {
    return yield* Effect.fail(new ConfigError({ code: "WALLET_NOT_CONFIGURED" }));
  }

  // The account that sends `renew` pays: the signer, or the account a route (`via`) sends from.
  const payer = (yield* routeSender(client, options.via, signer)) ?? signer;
  const names = yield* parseEthNames(options.names);
  const contracts = yield* requireRegistrationContracts(client);
  const referrer = yield* referrerOf(options.referrer);
  const token = yield* paymentTokenAddress(contracts, options.paymentToken);
  const now = yield* Rpc.blockTimestamp(client, {});
  if (options.until !== undefined && options.until <= now) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_EXPIRY",
        field: "until",
        input: options.until,
        shortMessage: "`until` must be in the future.",
      }),
    );
  }
  const length =
    options.until === undefined
      ? { duration: yield* requireDuration(options.duration) }
      : { until: options.until };
  // Each route's price check enforces its own oracle's payment tokens (`PaymentTokenNotSupported`).
  const quotes = yield* quoteRenewals(client, contracts, { names, token, ...length });

  // Names already reaching `until` are skipped, so a retry never pays for them again.
  const reached = (quote: RenewalQuote) => options.until !== undefined && quote.duration === 0n;
  const renewing = Arr.filter(quotes, (quote) => !reached(quote));
  const renewed = Arr.filter(quotes, reached);
  if (renewing.length === 0) {
    return yield* Effect.fail(new NameStateError({ code: "NAME_ALREADY_RENEWED" }));
  }
  for (const quote of renewing) {
    yield* requireDuration(quote.duration);
    // A name renewed in grace by less than the time it has been expired stays expired, though the
    // renewal is paid. A day of margin keeps it from expiring again at once.
    const minimum = now + 86_400n + 1n - quote.expiry;
    if (quote.duration < minimum) {
      return yield* Effect.fail(
        new InvalidInputError({
          code: "DURATION_TOO_SHORT",
          field: options.until === undefined ? "duration" : "until",
          input: quote.duration,
          shortMessage: `${quote.name} would still be expired, or expire within a day, after this renewal.`,
          hint: `Renew ${quote.name} for at least ${minimum} seconds.`,
        }),
      );
    }
  }

  // ENSv2 and ENSv1 names renew through different contracts, each pulling its own payment.
  const routes = new Map<Address, RenewalQuote[]>();
  for (const quote of renewing) {
    routes.set(quote.spender, [...(routes.get(quote.spender) ?? []), quote]);
  }
  const total = Arr.reduce(renewing, 0n, (sum, quote) => sum + quote.amount);
  const approvals = (yield* Effect.forEach(
    [...routes],
    ([spender, group]) =>
      paymentCalls(client, {
        payer,
        token,
        spender,
        amount: Arr.reduce(group, 0n, (sum, quote) => sum + quote.amount),
        balanceRequired: total,
        ...(isAddressEqual(payer, signer) ? {} : { funder: signer }),
      }),
    { concurrency: "unbounded" },
  )).flat();

  const steps: Plan.Step[] = [];
  if (approvals.length > 0) {
    steps.push({ id: "approve", description: "Approve payment", calls: approvals });
  }
  // At most 25 names per `renewBatch` call keeps each call's gas bounded. Each call is its own
  // step, so a resumed plan skips the ones already mined instead of renewing their names twice.
  const calls = Arr.flatMap([...routes], ([spender, group]) =>
    Array.from({ length: Math.ceil(group.length / 25) }, (_, index) => ({
      id: `renew:${group[0]?.route === "v1-renewer" ? "v1" : "v2"}:${index}`,
      call: renewCall(spender, group.slice(index * 25, (index + 1) * 25), { token, referrer }),
    })),
  );
  for (const { id, call } of calls) {
    steps.push({
      id: calls.length === 1 ? "renew" : id,
      description: "Renew",
      calls: [call],
    });
  }
  const warnings: Plan.Warning[] = [...normalizedWarnings(options.names, names)];
  if (renewed.length > 0) {
    warnings.push({
      code: "NAME_ALREADY_RENEWED",
      message: `${Arr.join(
        Arr.map(renewed, (quote) => quote.name),
        ", ",
      )} already expire at or after \`until\`, so they are not renewed again.`,
    });
  }

  return makePlan({
    operation: "registration.renew",
    chainId: client.chain.id,
    account: signer,
    steps,
    warnings,
    requirements: [
      {
        kind: "balance",
        amount: total,
        token,
        ...(isAddressEqual(payer, signer) ? {} : { account: payer }),
      },
    ],
  });
});

const write = Action.write("registration.renew", plan, { contractKind: "registrar" });

/** @internal Implementation of `Actions.registration.renew`. */
export const renew = write.send;

/** @internal Implementation of `Actions.registration.renewSync`. */
export const renewSync = (
  client: Client,
  options: SyncPromises.Options,
): Effect.Effect<SyncPromises.ReturnType, AnyError> =>
  write.sendSync(client, options).pipe(
    Effect.flatMap(
      Effect.fnUntraced(function* (result) {
        const contracts = yield* requireRegistrationContracts(client);
        const renewed = yield* renewedNames(client, {
          receipts: result.receipts,
          registrar: contracts.registrar,
          renewer: contracts.renewer,
          baseRegistrar: client.deployment.v1?.contracts.baseRegistrar,
        });
        return { ...result, ...renewed };
      }),
    ),
  );

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.registration.renew`. */
export const renewMethods = write.methods;
