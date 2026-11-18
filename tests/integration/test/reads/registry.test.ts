import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Name } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { factAddress, Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import { encodeAbiParameters, keccak256, pad } from "viem";

import { Clients } from "../support/clients.ts";
import { onProfile } from "../support/lane.ts";

describe("registry.get", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "identifies each kind of registry by the name whose children it holds",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { reader } = yield* Clients;
          const registryOf = (name: string) => Actions.registry.get(reader, { name });

          // The `.eth` registry is not a proxy: no implementation, nothing to upgrade.
          const eth = yield* registryOf("eth");
          assert.deepInclude(eth, { kind: "eth", canonicalName: "eth", implementation: null });
          assert.strictEqual(eth?.upgrade.blocker, "not-upgradeable");
          const userRegistry = yield* registryOf("v2-parent.eth");
          assert.deepInclude(userRegistry, {
            kind: "user",
            canonicalName: "v2-parent.eth",
            emancipated: false,
          });
          const migrated = fixtures.byId("migration.locked");
          const wrapperRegistry = yield* registryOf(migrated.name);
          assert.deepInclude(wrapperRegistry, {
            address: factAddress(migrated.facts, "wrapperRegistry"),
            kind: "wrapper",
            emancipated: true,
          });
          // A name without a subregistry has no registry for children.
          const childlessRegistry = yield* registryOf(fixtures.byId("v2.registered").name);
          assert.isNull(childlessRegistry);

          yield* expectFailure(Actions.registry.get(reader, { name: "" }), {
            _tag: "InvalidInputError",
            code: "INVALID_NAME",
          });
        }),
      { meta: { cases: ["M:A18", "M:A22", "M:C1"] } },
    );

    it.effect(
      "reads a registry by address, with its parent and canonical name",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { reader } = yield* Clients;
          const deep = fixtures.byId("v2.subnames");

          const registry = yield* Actions.registry.get(reader, {
            registry: String(deep.facts["registry"]),
          });
          assert.deepInclude(registry, {
            kind: "user",
            canonicalName: "sub.v2-parent.eth",
            parent: { registry: factAddress(deep.facts, "parentRegistry"), label: "sub" },
          });
        }),
      { meta: { cases: ["M:A18", "H24"] } },
    );

    it.effect(
      "follows a linked registry from both parents to one registry",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { reader } = yield* Clients;
          const linked = fixtures.byId("v2.linked");
          const parent = Name.parse(linked.name).parent ?? "";
          const aliasParent = Name.parse(String(linked.facts["alias"])).parent ?? "";

          const [canonical, alias] = yield* Effect.all(
            [
              Actions.registry.get(reader, { name: parent }),
              Actions.registry.get(reader, { name: aliasParent }),
            ],
            { concurrency: 1 },
          );
          assert.strictEqual(canonical?.address, linked.facts["registry"]);
          assert.strictEqual(alias?.address, linked.facts["registry"]);
          // The canonical name follows `setParent`; the other path is an alias.
          assert.strictEqual(alias?.canonicalName, parent);
          // One registry, so every child appears under both parents.
          const aliasName = yield* Actions.name.get(reader, {
            name: String(linked.facts["alias"]),
          });
          assert.deepInclude(aliasName, {
            status: "registered",
            owner: (yield* Devnet).accounts.bob,
          });
        }),
      { meta: { cases: ["O20", "O21"] } },
    );

    it.effect(
      "reports a replaced subregistry as unreachable",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { reader } = yield* Clients;
          const replaced = fixtures.byId("v2.replaced-subregistry");

          const [stale, current] = yield* Effect.all(
            [
              Actions.registry.get(reader, { registry: String(replaced.facts["staleRegistry"]) }),
              Actions.registry.get(reader, { name: "v2-replaced.eth" }),
            ],
            { concurrency: 1 },
          );
          // Its `setParent` still names a parent that now mounts another registry.
          assert.isNull(stale?.canonicalName);
          assert.strictEqual(current?.address, replaced.facts["registry"]);
        }),
      { meta: { cases: ["O22", "O23"] } },
    );

    it.effect(
      "offers an upgrade from an older implementation only when the latest accepts it",
      () =>
        Effect.gen(function* () {
          const chain = yield* Chain;
          const { accounts } = yield* Devnet;
          const { reader } = yield* Clients;
          const options = { name: "v2-parent.eth", account: accounts.alice };
          const current = yield* Actions.registry.get(reader, options);
          if (current === null || current.implementation === null) {
            assert.fail("not an upgradeable registry");
          }
          const latest = current.implementation;
          assert.deepInclude(current.upgrade, { latest, eligible: false, blocker: "up-to-date" });
          // A registry still on an older implementation: a copy of the latest at another address.
          const older = "0x00000000000000000000000000000000000ce5e5";

          const upgrade = yield* chain.isolated(
            Effect.gen(function* () {
              yield* chain.setCode(older, (yield* chain.code(latest)) ?? "0x");
              // ERC-1967 implementation slot.
              yield* chain.setStorage(
                current.address,
                "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
                pad(older),
              );
              const refused = (yield* Actions.registry.get(reader, options))?.upgrade;

              // `canUpgradeFrom` is a mapping at slot 1 of the implementation's own storage.
              yield* chain.setStorage(
                latest,
                keccak256(
                  encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [older, 1n]),
                ),
                pad("0x01"),
              );
              return { refused, accepted: (yield* Actions.registry.get(reader, options))?.upgrade };
            }),
          );
          assert.deepStrictEqual(upgrade, {
            refused: { latest, eligible: false, blocker: "not-approved" },
            accepted: { latest, eligible: true, blocker: null },
          });
        }),
      { meta: { cases: ["M:A26"] } },
    );

    // As on mainnet, the current UserRegistry lists no implementation in `canUpgradeFrom`.
    it.effect(
      "offers no upgrade from the v1.0.1 implementation to the current one",
      () =>
        Effect.gen(function* () {
          const chain = yield* Chain;
          const devnet = yield* Devnet;
          const { reader } = yield* Clients;
          const options = { name: "v2-parent.eth", account: devnet.accounts.alice };
          const current = yield* Actions.registry.get(reader, options);
          if (current === null) assert.fail("v2-parent.eth has no registry");

          const upgrade = yield* chain.isolated(
            Effect.gen(function* () {
              // ERC-1967 implementation slot.
              yield* chain.setStorage(
                current.address,
                "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
                pad(devnet.contract("v2.userRegistryImplementationV1_0_1")),
              );
              return (yield* Actions.registry.get(reader, options))?.upgrade;
            }),
          );
          assert.deepStrictEqual(upgrade, {
            latest: devnet.contract("v2.userRegistryImplementation"),
            eligible: false,
            blocker: "not-approved",
          });
        }),
      { meta: { cases: ["M:A26"] } },
    );
  });
});
