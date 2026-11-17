import { assert, layer } from "@effect/vitest";
import { Effect } from "effect";

import { bigname, indexerActions } from "@ensforge/sdk/indexer";
import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { ensforge } from "@ensforge/test-integration/support/chain";

import { Services } from "../stack/stack.ts";

layer(Services.layer({ profile: "mainnet-shaped" }), { excludeTestServices: true })(
  "bigname on the devnet",
  (it) => {
    it.effect("indexes a fixture name", () =>
      Effect.gen(function* () {
        const services = yield* Services;
        const devnet = yield* Devnet;
        const fixtures = yield* Fixtures;
        const ens = ensforge(devnet, { indexer: bigname({ url: services.indexerUrl }) }).extend(
          indexerActions(),
        );
        const name = fixtures.byId("records.v2").name;

        const status = yield* Effect.promise(() => ens.indexer.getStatus());
        const indexed = yield* Effect.promise(() => ens.indexer.getName({ name }));
        yield* Effect.logInfo("status", status, "name", indexed);
        assert.strictEqual(indexed?.name, name);
      }),
    );
  },
);
