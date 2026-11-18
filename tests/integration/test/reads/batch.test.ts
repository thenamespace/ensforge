import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Actions as Requests } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";

import { Clients } from "../support/clients.ts";
import { onProfile } from "../support/lane.ts";

describe("batch", () => {
  for (const profile of ["v1-live", "mainnet-shaped"] as const) {
    onProfile(profile)(profile, (it) => {
      it.effect("returns what each read returns on its own, failures included", () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const { reader } = yield* Clients;
          const name = fixtures.byId("records.v1").name;
          const address = String(fixtures.byId("primary.addr-reverse").facts["address"]);
          const missing = fixtures.byId("resolver.none").name;

          // Requests are plain data, built by the actions' `.request`.
          const { results } = yield* Actions.batch(reader, {
            requests: {
              state: Requests.name.get.request({ name }),
              records: Requests.record.get.request({ name, texts: ["url"], addresses: ["eth"] }),
              resolver: Requests.resolver.get.request({ name }),
              primary: Requests.primaryName.get.request({ address }),
              strict: Requests.record.get.request({ name: missing, texts: ["url"], strict: true }),
            },
          });
          const direct = yield* Effect.all({
            state: Actions.name.get(reader, { name }),
            records: Actions.record.get(reader, { name, texts: ["url"], addresses: ["eth"] }),
            resolver: Actions.resolver.get(reader, { name }),
            primary: Actions.primaryName.get(reader, { address }),
          });

          for (const key of ["state", "records", "resolver", "primary"] as const) {
            assert.deepStrictEqual<unknown>(
              results[key],
              { status: "success", result: direct[key] },
              key,
            );
          }
          assert(results.strict.status === "failure");
          assert.deepInclude(results.strict.error, {
            _tag: "NotFoundError",
            code: "RESOLVER_NOT_FOUND",
          });

          yield* expectFailure(
            Actions.batch(reader, {
              requests: [
                Requests.record.get.request({ name: missing, strict: true, texts: ["url"] }),
              ],
              allowFailure: false,
            }),
            { _tag: "NotFoundError", code: "RESOLVER_NOT_FOUND" },
          );
        }),
      );

      it.effect(
        "aligns primary names with their addresses; an empty batch returns nothing",
        () =>
          Effect.gen(function* () {
            const fixtures = yield* Fixtures;
            const { reader } = yield* Clients;
            const addressOf = (id: string) => String(fixtures.byId(id).facts["address"]);
            const named = addressOf("primary.addr-reverse");

            assert.deepStrictEqual(yield* Actions.batch(reader, { requests: [] }), { results: [] });
            const { results } = yield* Actions.batch(reader, {
              requests: [
                named,
                "0x000000000000000000000000000000000000dEaD",
                addressOf("primary.mismatch"),
                named,
              ].map((address) => Requests.primaryName.get.request({ address })),
            });
            assert.deepStrictEqual(
              results.map((result) => (result.status === "success" ? result.result : result)),
              ["rev-alice.eth", null, null, "rev-alice.eth"],
            );
          }),
        { meta: { cases: ["P17"] } },
      );
    });
  }
});
