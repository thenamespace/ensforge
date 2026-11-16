import { Effect, Schema } from "effect";

import { namehash as makeNamehash, normalize } from "viem/ens";

import { IndexerFilterError } from "../../errors/indexer-filter-error.js";
import { Namehash, type Namehash as NamehashType } from "../../schemas/hash.js";

export type IndexerNameIdentity =
  | { readonly name: string; readonly namehash: NamehashType }
  | { readonly name: null; readonly namehash: NamehashType };

export const decodeIndexerNameIdentity = Effect.fn("decodeIndexerNameIdentity")(function* (input: {
  readonly name?: unknown;
  readonly namehash?: unknown;
}): Effect.fn.Return<IndexerNameIdentity, IndexerFilterError> {
  return yield* Effect.try({
    try: () => {
      const hasName = typeof input.name === "string";
      const hasNamehash = typeof input.namehash === "string";

      if (hasName === hasNamehash) throw new Error("Provide exactly one name identity");

      if (hasName) {
        const name = normalize(input.name as string);

        return { name, namehash: Schema.decodeUnknownSync(Namehash)(makeNamehash(name)) };
      }

      return { name: null, namehash: Schema.decodeUnknownSync(Namehash)(input.namehash) };
    },
    catch: () =>
      new IndexerFilterError({
        code: "INVALID_FILTER",
        message: "Provide one valid ENS name or namehash",
      }),
  });
});
