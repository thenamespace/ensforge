import { Effect, Array as Arr } from "effect";

import { Deployments } from "@ensforge/contracts";
import type { Address } from "viem";

import type { Client } from "../../client/types.js";
import { NotFoundError } from "../../errors/classes/NotFoundError.js";
import { UnsupportedError } from "../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../errors/types.js";
import { sameAddress } from "../address.js";
import { readRecords } from "../records/read.js";

/** The ens-contracts `L2ReverseRegistrar` of `chainId`, where its primary names are set. */
export const l2Registrar = (chainId: number): Effect.Effect<Address, AnyError> => {
  const registrar = (Deployments.l2ReverseRegistrars as Readonly<Record<number, Address>>)[chainId];
  return registrar === undefined
    ? Effect.fail(
        new UnsupportedError({
          code: "UNSUPPORTED_ON_DEPLOYMENT",
          feature: `Primary names on chain ${chainId}`,
          hint: "ENS has an L2 reverse registrar on Base, OP Mainnet, Arbitrum One, Linea, Scroll and their Sepolia testnets.",
        }),
      )
    : Effect.succeed(registrar);
};

/**
 * Fails unless `name` resolves to `address` on every chain of `coinTypes` (each chain's address,
 * or the default EVM address its resolver falls back to), as readers of those primary names
 * require. Read on the ENS chain.
 */
export const requireForwardMatch = Effect.fnUntraced(function* (
  client: Client,
  name: string,
  address: Address,
  coinTypes: readonly bigint[],
): Effect.fn.Return<void, AnyError> {
  const records = yield* readRecords(client, { name, selection: { addresses: coinTypes } });
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the `addresses` selection yields an address or null per coin type
  const resolved = (records.addresses ?? {}) as Readonly<Record<string, Address | null>>;
  const missing = Arr.filter(
    coinTypes,
    (coinType) => !sameAddress(resolved[String(coinType)], address),
  );
  if (missing.length === 0) return undefined;

  return yield* Effect.fail(
    new NotFoundError({
      code: "PRIMARY_NAME_MISMATCH",
      shortMessage: `${name} does not resolve to ${address} on every chain it would name it on.`,
      details: [`Coin types without that address: ${Arr.join(Arr.map(missing, String), ", ")}`],
      hint: "Set the name's address for those chains (or its default EVM address) first, or pass `verify: false`.",
    }),
  );
});
