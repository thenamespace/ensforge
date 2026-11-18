import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Deployments } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import { getAddress } from "viem";

import { clientFor, resolverA, signer } from "../world.js";

const parentResolver = getAddress("0x00000000000000000000000000000000000000a2");
const subname = {
  name: "sub.alice.eth",
  names: { "alice.eth": { v1: { owner: signer, resolver: parentResolver } } },
} as const;

describe("name.get", () => {
  // ENSIP-10: only an extended resolver answers for names below its own.
  it.effect("reports a parent's extended resolver as the inherited resolver", () =>
    Effect.gen(function* () {
      const extended = clientFor({
        ...subname,
        found: { resolver: parentResolver, offset: 4n },
        extended: [parentResolver],
      });
      const plain = clientFor({ ...subname, found: { resolver: parentResolver, offset: 4n } });

      assert.deepInclude(yield* Actions.name.get(extended.ens, { name: subname.name }), {
        available: true,
        resolver: null,
        inheritedResolver: parentResolver,
      });
      assert.isNull((yield* Actions.name.get(plain.ens, { name: subname.name })).inheritedResolver);
    }),
  );

  it.effect("reports the ENSv1 resolver behind the ENSv1 bridge", () =>
    Effect.gen(function* () {
      const bridge = { resolver: Deployments.mainnet.v2.migration.ensV1Resolver, offset: 0n };
      const { ens } = clientFor({ ...subname, found: bridge, extended: [parentResolver] });

      assert.strictEqual(
        (yield* Actions.name.get(ens, { name: subname.name })).inheritedResolver,
        parentResolver,
      );
    }),
  );

  it.effect("has no inherited resolver when the name has its own", () =>
    Effect.gen(function* () {
      const { ens } = clientFor({
        name: "alice.eth",
        v1: { owner: signer, resolver: resolverA },
        found: { resolver: parentResolver, offset: 4n },
        extended: [parentResolver],
      });

      assert.deepInclude(yield* Actions.name.get(ens, { name: "alice.eth" }), {
        resolver: resolverA,
        inheritedResolver: null,
      });
    }),
  );
});
