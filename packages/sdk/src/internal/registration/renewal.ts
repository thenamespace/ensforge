import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { hexToBigInt, labelhash, type Address } from "viem";

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
  /** The name's expiry before the renewal, on its route's registrar. */
  readonly expiry: bigint;
  /** Seconds the renewal adds; `0n` for a name that already reaches `until`. */
  readonly duration: bigint;
};

/** How long to renew: the same duration for every name, or each name up to one expiry. */
export type RenewalLength =
  | { readonly duration: bigint; readonly until?: undefined }
  | { readonly until: bigint; readonly duration?: undefined };

/**
 * Quotes renewals in two batched rounds: both contracts are asked whether each name is renewable,
 * and its expiry is read on each route's registrar; then the route that accepts it prices its
 * duration (to `until` when given). Both renewers share the `IETHRenewer` ABI.
 */
export const quoteRenewals = Effect.fnUntraced(function* (
  client: Client,
  contracts: RegistrationContracts,
  options: {
    readonly names: readonly EthName[];
    readonly token: Address;
  } & RenewalLength &
    Read.BlockOptions,
): Effect.fn.Return<readonly RenewalQuote[], AnyError> {
  const at = blockAt(options);
  const baseRegistrar = client.deployment.v1?.contracts.baseRegistrar;
  const renewable = (address: Address, label: string) =>
    Rpc.readContractOrUndefined(client, {
      address,
      abi: Abis.v2.ethRegistrar,
      functionName: "isRenewable",
      args: [label],
      ...at,
    });

  return yield* Effect.forEach(
    options.names,
    (name) =>
      Effect.gen(function* () {
        const { v2, v1, v2Expiry, v1Expiry } = yield* Effect.all(
          {
            v2: renewable(contracts.registrar, name.label),
            v1: renewable(contracts.renewer, name.label),
            v2Expiry: Rpc.readContractOrUndefined(client, {
              address: contracts.ethRegistry,
              abi: Abis.v2.permissionedRegistry,
              functionName: "findExpiry",
              args: [name.label],
              ...at,
            }),
            v1Expiry:
              baseRegistrar === undefined
                ? Effect.undefined
                : Rpc.readContractOrUndefined(client, {
                    address: baseRegistrar,
                    abi: Abis.v1.baseRegistrar,
                    functionName: "nameExpires",
                    args: [hexToBigInt(labelhash(name.label))],
                    ...at,
                  }),
          },
          { concurrency: "unbounded" },
        );
        const chosen =
          v2 === true
            ? { route: "v2-registrar" as const, spender: contracts.registrar, expiry: v2Expiry }
            : v1 === true
              ? { route: "v1-renewer" as const, spender: contracts.renewer, expiry: v1Expiry }
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

        const { route, spender } = chosen;
        const expiry = chosen.expiry ?? 0n;
        const duration =
          options.until === undefined
            ? options.duration
            : options.until > expiry
              ? options.until - expiry
              : 0n;
        // A price call that reverts (e.g. the duration is too short) fails here, typed.
        const amount =
          options.until !== undefined && duration === 0n
            ? 0n
            : yield* Rpc.readContract(client, {
                address: spender,
                abi: Abis.v2.ethRegistrar,
                functionName: "getRenewPrice",
                args: [name.label, duration, options.token],
                ...at,
              });
        return { name: name.name, label: name.label, route, spender, amount, expiry, duration };
      }),
    { concurrency: "unbounded" },
  );
});
