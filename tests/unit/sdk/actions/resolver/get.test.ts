import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Deployments } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import { expectFailure } from "@ensforge/test-harness";
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

      const resolver = yield* Actions.resolver.get(ens, { name: subname.name });

      assert.deepInclude(resolver, { address: parentResolver, inherited: true, kind: "extended" });
    }),
  );

  // ENSIP-10: only an extended resolver answers for names below its own.
  it.effect("ignores a parent's resolver that is not extended", () =>
    Effect.gen(function* () {
      const { ens } = clientFor({ ...subname, found: { resolver: resolverA, offset: 4n } });

      const resolver = yield* Actions.resolver.get(ens, { name: subname.name });
      assert.isNull(resolver);
      yield* expectFailure(Actions.resolver.get(ens, { name: subname.name, strict: true }), {
        _tag: "NotFoundError",
        code: "RESOLVER_NOT_FOUND",
      });
    }),
  );

  // After the launch ENSv2 points premigrated ENSv1 names at the ENSv1 bridge.
  it.effect("describes the ENSv1 resolver behind the ENSv1 bridge", () =>
    Effect.gen(function* () {
      const bridge = { resolver: Deployments.mainnet.v2.migration.ensV1Resolver, offset: 0n };
      const served = clientFor({ ...subname, found: bridge, extended: [parentResolver] });
      const unserved = clientFor({
        ...subname,
        names: { "alice.eth": { v1: { owner: signer, resolver: resolverA } } },
        found: bridge,
      });
      // `eth`'s ENSv2 resolver leads back to ENSv2 and serves nothing.
      const looping = clientFor({
        ...subname,
        names: {
          eth: { v1: { owner: signer, resolver: Deployments.mainnet.v2.contracts.ensV2Resolver } },
        },
        found: bridge,
        extended: [Deployments.mainnet.v2.contracts.ensV2Resolver],
      });

      const inherited = yield* Actions.resolver.get(served.ens, { name: subname.name });
      assert.deepInclude(inherited, { address: parentResolver, inherited: true });
      for (const { ens } of [unserved, looping]) {
        const resolver = yield* Actions.resolver.get(ens, { name: subname.name });
        assert.isNull(resolver);
      }
    }),
  );

  it.effect("tells whether resolution reaches a name's own resolver", () =>
    Effect.gen(function* () {
      const name = { name: "alice.eth", v1: { owner: signer, resolver: resolverA } } as const;
      const reached = clientFor({ ...name, found: { resolver: resolverA, offset: 0n } });
      const unreached = clientFor(name);

      const servingResolver = yield* Actions.resolver.get(reached.ens, { name: name.name });
      const idleResolver = yield* Actions.resolver.get(unreached.ens, { name: name.name });
      assert.deepInclude(servingResolver, { address: resolverA, serving: true });
      assert.deepInclude(idleResolver, { address: resolverA, serving: false });
    }),
  );
});
