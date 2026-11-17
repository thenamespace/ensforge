import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Name } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import type { Address } from "viem";

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
          assert.deepInclude(yield* registryOf("v2-parent.eth"), {
            kind: "user",
            canonicalName: "v2-parent.eth",
            emancipated: false,
          });
          const migrated = fixtures.byId("migration.locked");
          assert.deepInclude(yield* registryOf(migrated.name), {
            address: migrated.facts["wrapperRegistry"] as Address,
            kind: "wrapper",
            emancipated: true,
          });
          // A name without a subregistry has no registry for children.
          assert.isNull(yield* registryOf(fixtures.byId("v2.registered").name));

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
            parent: { registry: deep.facts["parentRegistry"] as Address, label: "sub" },
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

          const [canonical, alias] = yield* Effect.all([
            Actions.registry.get(reader, { name: parent }),
            Actions.registry.get(reader, { name: aliasParent }),
          ]);
          assert.strictEqual(canonical?.address, linked.facts["registry"]);
          assert.strictEqual(alias?.address, linked.facts["registry"]);
          // The canonical name follows `setParent`; the other path is an alias.
          assert.strictEqual(alias?.canonicalName, parent);
        }),
      { meta: { cases: ["O20"] } },
    );

    it.effect(
      "reports a replaced subregistry as unreachable",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { reader } = yield* Clients;
          const replaced = fixtures.byId("v2.replaced-subregistry");

          const [stale, current] = yield* Effect.all([
            Actions.registry.get(reader, { registry: String(replaced.facts["staleRegistry"]) }),
            Actions.registry.get(reader, { name: "v2-replaced.eth" }),
          ]);
          assert.isNull(stale?.canonicalName);
          assert.strictEqual(current?.address, replaced.facts["registry"]);
        }),
      { meta: { cases: ["O23"] } },
    );
  });
});
