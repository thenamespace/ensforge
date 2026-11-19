import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Deployments } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import { getAddress, type Address } from "viem";

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

      const inherited = yield* Actions.name.get(extended.ens, { name: subname.name });
      assert.deepInclude(inherited, {
        available: true,
        resolver: null,
        inheritedResolver: parentResolver,
      });
      assert.isNull((yield* Actions.name.get(plain.ens, { name: subname.name })).inheritedResolver);
    }),
  );

  // A name in no registry that its parent's resolver answers for is managed by that namespace
  // (an L2 or a gateway), so it cannot be registered through ENS.
  it.effect("classifies names a parent's resolver serves as external", () =>
    Effect.gen(function* () {
      const served = (answer: "offchain" | Address | undefined) =>
        clientFor({
          ...subname,
          found: { resolver: parentResolver, offset: 4n },
          extended: [parentResolver],
          ...(answer === undefined ? {} : { served: { [parentResolver]: answer } }),
        }).ens;

      const offchain = yield* Actions.name.get(served("offchain"), { name: subname.name });
      const wildcard = yield* Actions.name.get(served(signer), { name: subname.name });
      const unanswered = yield* Actions.name.get(served(undefined), { name: subname.name });

      const external = {
        status: "external",
        available: false,
        renewable: false,
        owner: null,
      } as const;
      assert.deepInclude(offchain, {
        ...external,
        kind: "offchain",
        inheritedResolver: parentResolver,
      });
      assert.deepInclude(wildcard, { ...external, kind: "wildcard" });
      // ENSv2 resolvers declare ENSIP-10 without answering for labels their registry lacks.
      assert.deepInclude(unanswered, { kind: "available", available: true });
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

      const own = yield* Actions.name.get(ens, { name: "alice.eth" });
      assert.deepInclude(own, {
        resolver: resolverA,
        inheritedResolver: null,
      });
    }),
  );
});
