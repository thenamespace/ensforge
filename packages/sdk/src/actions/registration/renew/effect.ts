import { Effect, Array as Arr } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, type Address } from "viem";

import type { Client } from "../../../client/types.js";
import { ConfigError } from "../../../errors/classes/ConfigError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { addressOf } from "../../../internal/address.js";
import { requireRegistrationContracts } from "../../../internal/registration/contracts.js";
import { requireDuration } from "../../../internal/registration/duration.js";
import { renewedNames } from "../../../internal/registration/events.js";
import { parseEthNames } from "../../../internal/registration/labels.js";
import { paymentCalls, paymentTokenAddress } from "../../../internal/registration/payment.js";
import { referrerOf } from "../../../internal/registration/referrer.js";
import { quoteRenewals, type RenewalQuote } from "../../../internal/registration/renewal.js";
import { routeSender } from "../../../internal/write/via.js";
import { make as makePlan } from "../../../plan/make.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { renew as Promises, renewSync as SyncPromises } from "./index.js";

/** The renew call of one route: `renew` for one name, `renewBatch` for several. */
const renewCall = (
  spender: Address,
  quotes: readonly RenewalQuote[],
  options: { readonly duration: bigint; readonly token: Address; readonly referrer: `0x${string}` },
): Plan.Call => {
  const data = Arr.map(quotes, (quote) => ({
    label: quote.label,
    duration: options.duration,
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
  yield* requireDuration(options.duration);
  const contracts = yield* requireRegistrationContracts(client);
  const referrer = yield* referrerOf(options.referrer);
  const token = yield* paymentTokenAddress(contracts, options.paymentToken);
  // Each route's price check enforces its own oracle's payment tokens (`PaymentTokenNotSupported`).
  const quotes = yield* quoteRenewals(client, contracts, {
    names,
    duration: options.duration,
    token,
  });

  // ENSv2 and ENSv1 names renew through different contracts, each pulling its own payment.
  const routes = new Map<Address, RenewalQuote[]>();
  for (const quote of quotes) {
    routes.set(quote.spender, [...(routes.get(quote.spender) ?? []), quote]);
  }
  const total = Arr.reduce(quotes, 0n, (sum, quote) => sum + quote.amount);
  const approvals = (yield* Effect.forEach(
    [...routes],
    ([spender, group]) =>
      paymentCalls(client, {
        payer,
        token,
        spender,
        amount: Arr.reduce(group, 0n, (sum, quote) => sum + quote.amount),
        balanceRequired: total,
      }),
    { concurrency: "unbounded" },
  )).flat();

  const steps: Plan.Step[] = [];
  if (approvals.length > 0) {
    steps.push({ id: "approve", description: "Approve payment", calls: approvals });
  }
  steps.push({
    id: "renew",
    description: "Renew",
    // At most 25 names per `renewBatch` call keeps each call's gas bounded.
    calls: Arr.flatMap([...routes], ([spender, group]) =>
      Array.from({ length: Math.ceil(group.length / 25) }, (_, index) =>
        renewCall(spender, group.slice(index * 25, (index + 1) * 25), {
          duration: options.duration,
          token,
          referrer,
        }),
      ),
    ),
  });

  return makePlan({
    operation: "registration.renew",
    chainId: client.chain.id,
    account: signer,
    steps,
    requirements: [{ kind: "balance", amount: total, token }],
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
