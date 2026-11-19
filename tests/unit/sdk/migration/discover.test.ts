import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import { Name } from "@ensforge/sdk";
import { create } from "@ensforge/sdk/internal/client/create";
import { defineIndexer } from "@ensforge/sdk/internal/indexer/define";
import type { Subname } from "@ensforge/sdk/internal/indexer/types";
import { discoverSubnames } from "@ensforge/sdk/internal/internal/migration/discover";
import { expectFailure, scriptedTransport } from "@ensforge/test-harness";
import { contractScript } from "@ensforge/test-harness/contracts-eth-call";
import { labelhash, namehash } from "viem";
import { mainnet } from "viem/chains";

import { clientWith } from "../indexer/client.js";

/**
 * An indexer whose names have `counts[name]` live children each, `c0`, `c1`, …; the children in
 * `hashed` it knows only by the hash of their label.
 */
const indexerOf = (
  counts: Readonly<Record<string, number>>,
  asked: string[],
  hashed: readonly string[] = [],
) =>
  defineIndexer({
    id: "tree",
    getSubnames: ({ name }) => {
      asked.push(name);
      const items = Array.from({ length: counts[name] ?? 0 }, (_, index): Subname => {
        const label = `c${index}`;
        const known = `${label}.${name}`;
        const child = hashed.includes(known)
          ? `${Name.fromLabelhash(labelhash(label))}.${name}`
          : known;
        return {
          name: child,
          displayName: child,
          namespace: "ens",
          node: namehash(child),
          status: "active",
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
          subnameCount: counts[known] ?? 0,
          subregistry: null,
        };
      });
      return Promise.resolve({ items, cursor: null, hasMore: false, totalCount: items.length });
    },
  });

describe("discoverSubnames", () => {
  it.effect("descends only into children with subnames", () =>
    Effect.gen(function* () {
      const asked: string[] = [];
      const ens = clientWith(indexerOf({ "x.eth": 3, "c1.x.eth": 2, "c0.c1.x.eth": 1 }, asked));

      const found = yield* discoverSubnames(ens, "x.eth");

      assert.deepStrictEqual(found, {
        names: ["c0.x.eth", "c1.x.eth", "c2.x.eth", "c0.c1.x.eth", "c1.c1.x.eth", "c0.c0.c1.x.eth"],
        unknown: [],
      });
      assert.deepStrictEqual(asked, ["x.eth", "c1.x.eth", "c0.c1.x.eth"]);
    }),
  );

  it.effect("names a hashed child from the NameWrapper, when it was ever wrapped", () =>
    Effect.gen(function* () {
      const wrapped = "c0.x.eth";
      const { transport } = scriptedTransport(
        contractScript({
          contracts: [
            {
              address: Deployments.mainnet.v1.contracts.nameWrapper,
              abi: Abis.v1.nameWrapper,
              functions: {
                names: ([node]) => (node === namehash(wrapped) ? Name.dnsEncode(wrapped) : "0x"),
              },
            },
          ],
        }),
      );
      const ens = create({
        chain: mainnet,
        transports: { [mainnet.id]: transport },
        publicRpc: false,
        indexer: indexerOf({ "x.eth": 2, [wrapped]: 1 }, [], [wrapped, "c1.x.eth"]),
        batch: { multicall: false },
      });

      const found = yield* discoverSubnames(ens, "x.eth");

      assert.deepStrictEqual(found, {
        names: [wrapped, "c0.c0.x.eth"],
        unknown: [`${Name.fromLabelhash(labelhash("c1"))}.x.eth`],
      });
    }),
  );

  it.effect("counts the 500-subname limit across every level", () =>
    Effect.gen(function* () {
      const ens = clientWith(indexerOf({ "x.eth": 300, "c7.x.eth": 201 }, []));

      const error = yield* expectFailure(discoverSubnames(ens, "x.eth"), {
        _tag: "MigrationError",
        code: "NOT_ELIGIBLE",
      });
      assert.deepStrictEqual(error.blockers, ["more than 500 subnames"]);

      const within = clientWith(indexerOf({ "x.eth": 300, "c7.x.eth": 200 }, []));
      assert.lengthOf((yield* discoverSubnames(within, "x.eth"))?.names ?? [], 500);
    }),
  );
});
