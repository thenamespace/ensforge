import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Actions as Requests } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";

import { ensforge, onProfile } from "../support/chain.ts";

describe("batch", () => {
  for (const profile of ["v1-live", "mainnet-shaped"] as const) {
    onProfile(profile)(profile, (it) => {
      it.effect("returns what each read returns on its own, failures included", () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const ens = ensforge(yield* Devnet);
          const name = fixtures.byId("records.v1").name;
          const address = String(fixtures.byId("primary.addr-reverse").facts["address"]);
          const missing = fixtures.byId("resolver.none").name;

          // Requests are plain data, built by the actions' `.request`.
          const { results } = yield* Actions.batch(ens, {
            requests: {
              state: Requests.name.get.request({ name }),
              records: Requests.record.get.request({ name, texts: ["url"], addresses: ["eth"] }),
              resolver: Requests.resolver.get.request({ name }),
              primary: Requests.primaryName.get.request({ address }),
              strict: Requests.record.get.request({ name: missing, texts: ["url"], strict: true }),
            },
          });
          const direct = yield* Effect.all({
            state: Actions.name.get(ens, { name }),
            records: Actions.record.get(ens, { name, texts: ["url"], addresses: ["eth"] }),
            resolver: Actions.resolver.get(ens, { name }),
            primary: Actions.primaryName.get(ens, { address }),
          });

          for (const key of ["state", "records", "resolver", "primary"] as const) {
            assert.deepStrictEqual<unknown>(
              results[key],
              { status: "success", result: direct[key] },
              key,
            );
          }
          assert.strictEqual(results.strict.status, "failure");
          assert.deepInclude((results.strict as { readonly error: unknown }).error as object, {
            _tag: "NotFoundError",
            code: "RESOLVER_NOT_FOUND",
          });

          yield* expectFailure(
            Actions.batch(ens, {
              requests: [
                Requests.record.get.request({ name: missing, strict: true, texts: ["url"] }),
              ],
              allowFailure: false,
            }),
            { _tag: "NotFoundError", code: "RESOLVER_NOT_FOUND" },
          );
        }),
      );
    });
  }
});
