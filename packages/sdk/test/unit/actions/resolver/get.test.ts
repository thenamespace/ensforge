import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Actions } from "@ensforge/sdk";
import { expectRejection } from "@ensforge/test-harness";
import { getAddress } from "viem";

import { clientFor, resolverA, signer } from "../world.js";

const parentResolver = getAddress("0x00000000000000000000000000000000000000a2");
const subname = {
  name: "sub.alice.eth",
  v1: { owner: signer },
  names: { "alice.eth": { v1: { owner: signer, resolver: parentResolver } } },
} as const;

describe("resolver.get", () => {
  it.effect("returns a parent's extended resolver as inherited", () =>
    Effect.gen(function* () {
      const { ens } = clientFor({
        ...subname,
        found: { resolver: parentResolver, offset: 4n },
        extended: [parentResolver],
      });

      const resolver = yield* Effect.promise(() =>
        Actions.resolver.get(ens, { name: subname.name }),
      );
      assert.deepInclude(resolver, { address: parentResolver, inherited: true, kind: "extended" });
    }),
  );

  // ENSIP-10: only an extended resolver answers for names below its own.
  it.effect("ignores a parent's resolver that is not extended", () =>
    Effect.gen(function* () {
      const { ens } = clientFor({ ...subname, found: { resolver: resolverA, offset: 4n } });

      assert.isNull(yield* Effect.promise(() => Actions.resolver.get(ens, { name: subname.name })));
      yield* expectRejection(
        () => Actions.resolver.get(ens, { name: subname.name, strict: true }),
        { _tag: "NotFoundError", code: "RESOLVER_NOT_FOUND" },
      );
    }),
  );
});
