import { assert, layer } from "@effect/vitest";
import { Arbitrary, Effect } from "effect";

import { Command } from "@ensforge/test-fuzz/commands";
import { targetsOf } from "@ensforge/test-fuzz/commands/names";
import { makeContext } from "@ensforge/test-fuzz/model/command";
import type { Model } from "@ensforge/test-fuzz/model/model";
import { applySequence } from "@ensforge/test-fuzz/model/run";
import { makeWorld, subLabel } from "@ensforge/test-fuzz/model/world";
import { maxLength, seed } from "@ensforge/test-fuzz/sequences/budget";
import { Clients } from "@ensforge/test-integration/support/clients";

import { Services } from "../stack/stack.ts";
import { nameDifferences } from "./compare.ts";

// The fuzz lane's random operation sequences, applied one after another (bigname cannot follow a
// revert), then every name they touch read from the chain and from bigname. Raise the budget with
// `ENSFORGE_INDEXER_RUNS`; `ENSFORGE_FUZZ_SEED` and `ENSFORGE_FUZZ_LENGTH` apply as in the fuzz lane.

layer(Services.layer({ profile: "mainnet-shaped" }), { excludeTestServices: true })(
  "bigname after random operation sequences",
  (it) => {
    it.effect(`agrees with the chain after every sequence (seed ${seed})`, () =>
      Effect.gen(function* () {
        const services = yield* Services;
        const clients = yield* Clients;
        const world = yield* makeWorld;
        const context = yield* makeContext(world);
        const ens = clients.make({ indexer: services.indexer });
        const names = targetsOf(world).flatMap((name) => [name, `${subLabel}.${name}`]);
        const sequences = yield* Arbitrary.sampleEffect(
          Arbitrary.array(Arbitrary.schema(Command), { minLength: 1, maxLength }),
          { count: Number(process.env["ENSFORGE_INDEXER_RUNS"] ?? 5), seed },
        );

        // Each sequence continues from the state, and the model, the previous one left.
        let model: Model | undefined;
        for (const [index, commands] of sequences.entries()) {
          model = yield* applySequence(context, commands, model);
          yield* services.waitForIndexed();

          // Known bigname behaviours (`Difference.known`) are expected; anything else is a finding.
          const found: string[] = [];
          for (const name of names) {
            const differences = yield* nameDifferences(ens, name, name);
            found.push(...differences.filter((d) => d.known === undefined).map((d) => d.entry));
          }
          assert.deepStrictEqual(
            found,
            [],
            `sequence ${index} (seed ${seed}): ${JSON.stringify(commands)}`,
          );
        }
      }),
    );
  },
);
