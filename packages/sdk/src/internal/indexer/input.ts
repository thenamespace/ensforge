import { Effect, Array as Arr, String as Str } from "effect";

import { namehash, type Address } from "viem";

import type { Client } from "../../client/types.js";
import { IndexerError } from "../../errors/classes/IndexerError.js";
import { InvalidInputError } from "../../errors/classes/InvalidInputError.js";
import type { AnyError } from "../../errors/types.js";
import type { Namespace } from "../../indexer/types.js";
import * as CoinType from "../../utils/CoinType.js";
import { tryAny } from "../anyError.js";
import { normalizeName } from "../name/normalize.js";
import { requireAddress } from "../name/write.js";

/**
 * The namespace a name belongs to: Basenames are the subnames of `base.eth`, whose labels may also
 * be encoded (`x.[<labelhash of base>].eth`).
 */
export const namespaceOf = (name: string): Namespace => {
  const labels = Str.split(".")(name);
  return labels.length > 2 && namehash(Arr.join(labels.slice(-2), ".")) === namehash("base.eth")
    ? "basenames"
    : "ens";
};

/** Options every indexer action takes that are not part of the indexer query. */
type CallOptions = {
  readonly signal?: AbortSignal | undefined;
  readonly strict?: boolean | undefined;
};

/** The options without `signal` and `strict`, which only the action uses. */
export const queryOf = <options extends CallOptions>(
  options: options,
): Omit<options, "signal" | "strict"> => {
  const { signal: _signal, strict: _strict, ...query } = options;
  return query;
};

// L2 namespaces with a fixed parent that no indexer serves; their names live only on their L2.
const unindexed = [
  ["linea", "Linea Names", "Linea"],
  ["celonames", "Celonames", "Celo"],
] as const;

/**
 * A normalized name and its namespace (`namespace` wins over the inferred one). A name in an L2
 * namespace no indexer serves (Linea Names, Celonames) fails with `INDEXER_UNSUPPORTED` rather
 * than reading as unknown to ENS's index; with `children`, so does its parent name, whose
 * children live on the L2.
 */
export const nameInput = (
  client: Client,
  name: string,
  namespace: Namespace | undefined,
  children = false,
): Effect.Effect<{ readonly name: string; readonly namespace: Namespace }, AnyError> =>
  normalizeName(name).pipe(
    Effect.flatMap(
      (
        normalized,
      ): Effect.Effect<{ readonly name: string; readonly namespace: Namespace }, AnyError> => {
        if (normalized === "") {
          return Effect.fail(
            new InvalidInputError({
              code: "INVALID_NAME",
              input: name,
              shortMessage: "The root name is not indexed; pass a name.",
            }),
          );
        }
        if (namespace === undefined) {
          const namespaces = client.deployment.namespaces ?? {};
          for (const [id, family, chain] of unindexed) {
            const parent = namespaces[id]?.parent;
            if (
              parent !== undefined &&
              (Str.endsWith(`.${parent}`)(normalized) || (children && normalized === parent))
            ) {
              return Effect.fail(
                new IndexerError({
                  code: "INDEXER_UNSUPPORTED",
                  shortMessage: `No indexer serves ${family}: ${normalized} lives on ${chain}.`,
                  hint: "Read it on-chain with name.get and record.get.",
                  context: { name: normalized },
                }),
              );
            }
          }
        }
        return Effect.succeed({
          name: normalized,
          namespace: namespace ?? namespaceOf(normalized),
        });
      },
    ),
  );

/** An optional name filter, normalized. */
export const optionalName = (
  name: string | undefined,
): Effect.Effect<string | undefined, AnyError> =>
  name === undefined ? Effect.undefined : normalizeName(name);

/** An optional address filter, checksummed. */
export const optionalAddress = (
  address: string | undefined,
  field: string,
): Effect.Effect<Address | undefined, AnyError> =>
  address === undefined ? Effect.undefined : requireAddress(address, field);

/** A contract on `chainId`, by default the client's chain. */
export const contractInput = (
  client: Client,
  options: { readonly address: string; readonly chainId?: number | undefined },
  field = "address",
): Effect.Effect<{ readonly address: Address; readonly chainId: number }, AnyError> =>
  requireAddress(options.address, field).pipe(
    Effect.map((address) => ({ address, chainId: options.chainId ?? client.chain.id })),
  );

/** A coin type option: a symbol, `{ chainId }`, a number, or `evm` for every EVM chain. */
export const coinInput = (
  // oxlint-disable-next-line typescript/no-redundant-type-constituents -- the literal or explicit type argument documents the public type
  coin: CoinType.Input | "evm" | undefined,
): Effect.Effect<bigint | "evm" | undefined, AnyError> =>
  coin === undefined || coin === "evm" ? Effect.succeed(coin) : tryAny(() => CoinType.from(coin));
