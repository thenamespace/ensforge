import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import { defineIndexer, type Subname } from "@ensforge/sdk/indexer";
import { expectFailure } from "@ensforge/test-harness";
import { namehash } from "viem";

import { clientFor, signer, type World } from "../world.js";

const child = "pay.alice.eth";

/** An indexer that knows one subname of `child`, in `status`. */
const indexerWith = (status: Subname["status"]) =>
  defineIndexer({
    id: "subnames",
    getSubnames: () =>
      Promise.resolve({
        items: [
          {
            name: `kid.${child}`,
            displayName: `kid.${child}`,
            namespace: "ens",
            node: namehash(`kid.${child}`),
            status,
            authority: "ensV1",
            owner: null,
            manager: null,
            registeredAt: null,
            createdAt: null,
            expiresAt: null,
            graceEndsAt: null,
            expiryReason: null,
            ensV1: null,
            labelhash: null,
            subnameCount: 0,
            subregistry: null,
          },
        ],
        cursor: null,
        hasMore: false,
        totalCount: 1,
      }),
  });

const world = (indexer?: World["indexer"]): World => ({
  name: child,
  v1: { owner: signer },
  names: { "alice.eth": { v1: { owner: signer } } },
  indexer,
});

describe("subname.remove.prepare", () => {
  // The removed child's own subnames stay in the registry and keep resolving.
  it.effect.each([["active"], ["expired"]] as const)(
    "refuses an ENSv1 child with an %s subname, unless allowed",
    ([status]) =>
      Effect.gen(function* () {
        const { ens } = clientFor(world(indexerWith(status)));

        yield* expectFailure(Actions.subname.remove.prepare(ens, { name: child }), {
          _tag: "NameStateError",
          code: "NAME_HAS_SUBNAMES",
        });
        const plan = yield* Actions.subname.remove.prepare(ens, {
          name: child,
          allowOrphanedSubnames: true,
        });
        assert.strictEqual(plan.calls.length, 1);
      }),
  );

  it.effect.each([
    ["a released subname", indexerWith("released"), []],
    ["no indexer", undefined, ["SUBNAMES_UNCHECKED"]],
  ] as const)("removes an ENSv1 child with %s", ([, indexer, codes]) =>
    Effect.gen(function* () {
      const plan = yield* Actions.subname.remove.prepare(clientFor(world(indexer)).ens, {
        name: child,
      });

      assert.deepStrictEqual<readonly string[]>(
        Arr.map(plan.warnings, (warning) => warning.code),
        codes,
      );
    }),
  );
});
