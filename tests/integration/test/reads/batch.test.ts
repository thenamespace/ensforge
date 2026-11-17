import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Actions } from "@ensforge/sdk";
import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectRejection } from "@ensforge/test-harness";

import { call, ensforge, onProfile } from "../support/chain.ts";

describe("batch", () => {
  onProfile("v1-live")("v1-live", (it) => {
    it.effect("returns what each read returns on its own, failures included", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const ens = ensforge(yield* Devnet);
        const name = fixtures.byId("records.v1").name;
        const address = String(fixtures.byId("primary.addr-reverse").facts["address"]);
        const missing = fixtures.byId("resolver.none").name;

        const { results } = yield* call(() =>
          Actions.batch(ens, {
            requests: {
              state: Actions.name.get.request({ name }),
              records: Actions.record.get.request({ name, texts: ["url"], addresses: ["eth"] }),
              resolver: Actions.resolver.get.request({ name }),
              primary: Actions.primaryName.get.request({ address }),
              strict: Actions.record.get.request({ name: missing, texts: ["url"], strict: true }),
            },
          }),
        );
        const direct = yield* Effect.all({
          state: call(() => ens.name.get({ name })),
          records: call(() => ens.record.get({ name, texts: ["url"], addresses: ["eth"] })),
          resolver: call(() => ens.resolver.get({ name })),
          primary: call(() => ens.primaryName.get({ address })),
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

        yield* expectRejection(
          () =>
            Actions.batch(ens, {
              requests: [
                Actions.record.get.request({ name: missing, strict: true, texts: ["url"] }),
              ],
              allowFailure: false,
            }),
          { _tag: "NotFoundError", code: "RESOLVER_NOT_FOUND" },
        );
      }),
    );
  });
});
