import { assert, describe, it } from "@effect/vitest";
import { Effect, Stream } from "effect";

import * as Actions from "@ensforge/sdk/internal/actions/effect";
import { bigname } from "@ensforge/sdk/internal/indexer/bigname";
import { paginate as streamPages } from "@ensforge/sdk/internal/indexer/Indexer.effect";
import { paginate } from "@ensforge/sdk/internal/indexer/paginate";
import { fakeBigname } from "@ensforge/test-harness/indexer/fake-bigname";

import { clientWith } from "./client.js";

/** A client on the fake bigname, and the cursors its subname requests carried. */
const bignameClient = () => {
  const fake = fakeBigname();
  const ens = clientWith(bigname({ url: fake.url, fetch: fake.fetch }));
  const cursors = () => fake.requestsTo("/names/{name}/subnames").map((r) => r.query.get("cursor"));
  return { ens, cursors };
};

const names = (pages: readonly { readonly items: readonly { readonly name: string }[] }[]) =>
  pages.flatMap((page) => page.items.map((item) => item.name));

// `paginate` is the Promise API's async iterator; a stream drives it as `for await` would, and
// taking fewer pages returns the iterator early, as `break` does.
describe("paginate", () => {
  it.effect("follows cursors until the last page", () =>
    Effect.gen(function* () {
      const { ens, cursors } = bignameClient();

      const pages = yield* Stream.runCollect(
        Stream.fromAsyncIterable(
          paginate(ens.indexer.getSubnames, { name: "nick.eth", limit: 2 }),
          (cause) => cause,
        ),
      );

      assert.deepStrictEqual(names(pages), ["alpha.nick.eth", "beta.nick.eth", "gamma.nick.eth"]);
      assert.deepStrictEqual(cursors(), [null, "c2"]);
    }),
  );

  it.effect("starts from the given cursor and stops requesting on break", () =>
    Effect.gen(function* () {
      const { ens, cursors } = bignameClient();

      const pages = yield* Stream.runCollect(
        Stream.fromAsyncIterable(
          paginate(ens.indexer.getSubnames, { name: "nick.eth", limit: 1, cursor: "c1" }),
          (cause) => cause,
        ).pipe(Stream.take(1)),
      );

      assert.deepStrictEqual(names(pages), ["beta.nick.eth"]);
      assert.deepStrictEqual(cursors(), ["c1"]);
    }),
  );
});

describe("Indexer.paginate", () => {
  it.effect("streams every page, and only the pages taken", () =>
    Effect.gen(function* () {
      const { ens, cursors } = bignameClient();
      const pages = streamPages((cursor) =>
        Actions.indexer.getSubnames(ens, { name: "nick.eth", limit: 1, cursor }),
      );

      const all = yield* Stream.runCollect(pages);
      const first = yield* Stream.runCollect(Stream.take(pages, 1));

      assert.strictEqual(names(all).length, 3);
      assert.deepStrictEqual(names(first), ["alpha.nick.eth"]);
      assert.deepStrictEqual(cursors(), [null, "c1", "c2", null]);
    }),
  );
});
