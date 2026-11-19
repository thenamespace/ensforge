import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import type { Address } from "viem";

import type { Client } from "../../client/types.js";
import { NotFoundError } from "../../errors/classes/NotFoundError.js";
import type { AnyError } from "../../errors/types.js";
import { sameAddress } from "../address.js";
import { readRecords } from "../records/read.js";
import * as Rpc from "../rpc/index.js";

/**
 * The primary name of `address` on an L2, read as ENSIP-19 resolution does but on the L2 itself
 * (`l2` is on that chain), not through Ethereum's proof of its state:
 *
 * 1. the name the address set in the chain's `L2ReverseRegistrar`;
 * 2. otherwise its default EVM name (`default.reverse`), through `defaultName` on Ethereum;
 * 3. with `verify`, the name must resolve back to `address` for the chain's coin type (or the
 *    default EVM address), else `PRIMARY_NAME_MISMATCH`.
 *
 * `""` when the address has no name. Fresher than the Ethereum path, which proves finalized L2
 * state: a name set a moment ago is already there.
 */
export const reverseOnL2: (
  client: Client,
  l2: Client,
  registrar: Address,
  options: {
    readonly address: Address;
    readonly coinType: bigint;
    readonly verify: boolean;
    readonly defaultName: Effect.Effect<string, AnyError>;
  },
) => Effect.Effect<string, AnyError> = Effect.fnUntraced(function* (
  client: Client,
  l2: Client,
  registrar: Address,
  options: {
    readonly address: Address;
    readonly coinType: bigint;
    readonly verify: boolean;
    readonly defaultName: Effect.Effect<string, AnyError>;
  },
): Effect.fn.Return<string, AnyError> {
  const own = yield* Rpc.readContract(l2, {
    address: registrar,
    abi: Abis.v1.l2ReverseRegistrar,
    functionName: "nameForAddr",
    args: [options.address],
  });
  const name = own === "" ? yield* options.defaultName : own;
  if (name === "" || !options.verify) return name;

  // Record reads go where the name lives: an L2 name's address is read on its L2. A name that is
  // not normalized is left to the caller, which rejects it as Ethereum's path does.
  const records = yield* readRecords(client, {
    name,
    selection: { addresses: [options.coinType] },
  }).pipe(
    Effect.catchIf(
      (error: AnyError) => error.code === "INVALID_NAME",
      () => Effect.succeed(null),
    ),
  );
  if (records === null) return name;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the `addresses` selection yields an address or null per coin type
  const resolved = (records.addresses ?? {}) as Readonly<Record<string, Address | null>>;
  if (sameAddress(resolved[String(options.coinType)], options.address)) return name;
  return yield* Effect.fail(
    new NotFoundError({
      code: "PRIMARY_NAME_MISMATCH",
      shortMessage: `${name} does not resolve back to ${options.address}.`,
    }),
  );
});
