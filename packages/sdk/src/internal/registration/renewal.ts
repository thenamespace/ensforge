import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import type { Address } from "viem";

import type { RenewalRoute } from "../../actions/registration/types.js";
import type { Client } from "../../client/types.js";
import { NameStateError } from "../../errors/classes/NameStateError.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import { blockAt } from "../rpc/block.js";
import * as Rpc from "../rpc/index.js";
import type { RegistrationContracts } from "./contracts.js";
import type { EthName } from "./labels.js";

/** The price of renewing one name, and who to pay. */
export type RenewalQuote = {
  readonly name: string;
  readonly label: string;
  readonly route: RenewalRoute;
  /** Contract that renews the name and pulls the payment. */
  readonly spender: Address;
  readonly amount: bigint;
};

/**
 * Quotes renewals in one batched round: both contracts are asked whether each name is renewable
 * and for its price, and the one that accepts it is the route. Both share the `IETHRenewer` ABI.
 */
export const quoteRenewals = Effect.fnUntraced(function* (
  client: Client,
  contracts: RegistrationContracts,
  options: {
    readonly names: readonly EthName[];
    readonly duration: bigint;
    readonly token: Address;
  } & Read.BlockOptions,
): Effect.fn.Return<readonly RenewalQuote[], AnyError> {
  const at = blockAt(options);
  const ask = (address: Address, label: string) =>
    Effect.all(
      {
        renewable: Rpc.readContractOrUndefined(client, {
          address,
          abi: Abis.v2.ethRegistrar,
          functionName: "isRenewable",
          args: [label],
          ...at,
        }),
        price: Rpc.readContractOrUndefined(client, {
          address,
          abi: Abis.v2.ethRegistrar,
          functionName: "getRenewPrice",
          args: [label, options.duration, options.token],
          ...at,
        }),
      },
      { concurrency: "unbounded" },
    );

  return yield* Effect.forEach(
    options.names,
    (name) =>
      Effect.gen(function* () {
        const { v2, v1 } = yield* Effect.all(
          { v2: ask(contracts.registrar, name.label), v1: ask(contracts.renewer, name.label) },
          { concurrency: "unbounded" },
        );
        const chosen =
          v2.renewable === true
            ? { route: "v2-registrar" as const, spender: contracts.registrar, price: v2.price }
            : v1.renewable === true
              ? { route: "v1-renewer" as const, spender: contracts.renewer, price: v1.price }
              : undefined;
        if (chosen === undefined) {
          return yield* Effect.fail(
            new NameStateError({
              code: "NAME_NOT_RENEWABLE",
              shortMessage: `${name.name} cannot be renewed.`,
              hint: "Only registered names, or names in their grace period, can be renewed.",
            }),
          );
        }

        // A renewable name without a price means the price call reverted (e.g. the duration is
        // too short); read it again without swallowing the error.
        const { route, spender } = chosen;
        const amount =
          chosen.price ??
          (yield* Rpc.readContract(client, {
            address: spender,
            abi: Abis.v2.ethRegistrar,
            functionName: "getRenewPrice",
            args: [name.label, options.duration, options.token],
            ...at,
          }));
        return { name: name.name, label: name.label, route, spender, amount };
      }),
    { concurrency: "unbounded" },
  );
});
