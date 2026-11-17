import { assert, describe, it } from "@effect/vitest";
import { Effect, Stream } from "effect";

import * as Actions from "@ensforge/sdk/internal/actions/effect";
import { bigname } from "@ensforge/sdk/internal/indexer/bigname";
import { paginate as streamPages } from "@ensforge/sdk/internal/indexer/Indexer.effect";
import { paginate } from "@ensforge/sdk/internal/indexer/paginate";
import { fakeBigname } from "@ensforge/test-harness/indexer/fake-bigname";

import { clientWith } from "./client.js";

const setup = () => {
  const fake = fakeBigname();
  const client = clientWith(bigname({ url: fake.url, fetch: fake.fetch }));
  const cursors = () => fake.requestsTo("/names/{name}/subnames").map((r) => r.query.get("cursor"));
  return { client, cursors };
};

const names = (pages: readonly { readonly items: readonly { readonly name: string }[] }[]) =>
  pages.flatMap((page) => page.items.map((item) => item.name));

describe("paginate", () => {
  it("follows cursors until the last page", async () => {
    const { client, cursors } = setup();
    const pages = [];

    for await (const page of paginate(client.indexer.getSubnames, { name: "nick.eth", limit: 2 })) {
      pages.push(page);
    }

    assert.deepStrictEqual(names(pages), ["alpha.nick.eth", "beta.nick.eth", "gamma.nick.eth"]);
    assert.deepStrictEqual(cursors(), [null, "c2"]);
  });

  it("starts from the given cursor and stops requesting on break", async () => {
    const { client, cursors } = setup();

    for await (const page of paginate(client.indexer.getSubnames, {
      name: "nick.eth",
      limit: 1,
      cursor: "c1",
    })) {
      assert.deepStrictEqual(names([page]), ["beta.nick.eth"]);
      break;
    }

    assert.deepStrictEqual(cursors(), ["c1"]);
  });
});

describe("Indexer.paginate", () => {
  it.effect("streams every page, and only the pages taken", () =>
    Effect.gen(function* () {
      const { client, cursors } = setup();
      const pages = streamPages((cursor) =>
        Actions.indexer.getSubnames(client, { name: "nick.eth", limit: 1, cursor }),
      );

      const all = yield* Stream.runCollect(pages);
      const first = yield* Stream.runCollect(Stream.take(pages, 1));

      assert.strictEqual(names(all).length, 3);
      assert.deepStrictEqual(names(first), ["alpha.nick.eth"]);
      assert.deepStrictEqual(cursors(), [null, "c1", "c2", null]);
    }),
  );
});
