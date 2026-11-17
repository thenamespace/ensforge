import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectRejection } from "@ensforge/test-harness";
import type { Address } from "viem";

import { call, ensforge, onProfile } from "../support/chain.ts";

const parentOf = (name: string) => name.slice(name.indexOf(".") + 1);

describe("registry.get", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "identifies each kind of registry by the name whose children it holds",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const ens = ensforge(yield* Devnet);
          const registryOf = (name: string) => call(() => ens.registry.get({ name }));

          assert.deepInclude(yield* registryOf("eth"), { kind: "eth", canonicalName: "eth" });
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

          yield* expectRejection(() => ens.registry.get({ name: "" }), {
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
          const ens = ensforge(yield* Devnet);
          const deep = fixtures.byId("v2.subnames");

          const registry = yield* call(() =>
            ens.registry.get({ registry: String(deep.facts["registry"]) }),
          );
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
          const ens = ensforge(yield* Devnet);
          const linked = fixtures.byId("v2.linked");

          const [canonical, alias] = yield* Effect.all([
            call(() => ens.registry.get({ name: parentOf(linked.name) })),
            call(() => ens.registry.get({ name: parentOf(String(linked.facts["alias"])) })),
          ]);
          assert.strictEqual(canonical?.address, linked.facts["registry"]);
          assert.strictEqual(alias?.address, linked.facts["registry"]);
          // The canonical name follows `setParent`; the other path is an alias.
          assert.strictEqual(alias?.canonicalName, parentOf(linked.name));
        }),
      { meta: { cases: ["O20"] } },
    );

    it.effect(
      "reports a replaced subregistry as unreachable",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const ens = ensforge(yield* Devnet);
          const replaced = fixtures.byId("v2.replaced-subregistry");

          const [stale, current] = yield* Effect.all([
            call(() => ens.registry.get({ registry: String(replaced.facts["staleRegistry"]) })),
            call(() => ens.registry.get({ name: "v2-replaced.eth" })),
          ]);
          assert.isNull(stale?.canonicalName);
          assert.strictEqual(current?.address, replaced.facts["registry"]);
        }),
      { meta: { cases: ["O23"] } },
    );
  });
});
