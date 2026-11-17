import { describe, expectTypeOf, it } from "@effect/vitest";
import type { Effect, Stream } from "effect";

import { Actions, type Ensforge } from "@ensforge/sdk";
import { Indexer } from "@ensforge/sdk/effect";
import {
  paginate,
  type AddressName,
  type IndexerActions,
  type Page,
  type Subname,
} from "@ensforge/sdk/indexer";

declare const ens: Ensforge.Client<IndexerActions>;

// The loader's parameter needs an annotation: a context-sensitive callback is not inferred from
// the options argument.
const load = (options: Actions.indexer.getSubnames.Options) =>
  Actions.indexer.getSubnames(ens, options);

describe("paginate", () => {
  it("yields pages of the bound action's items", () => {
    const pages = paginate(ens.indexer.getSubnames, { name: "ens.eth", limit: 200 });
    expectTypeOf(pages).toEqualTypeOf<AsyncGenerator<Page<Subname>, void, undefined>>();

    const names = paginate(ens.indexer.getNamesForAddress, { address: "0x1" });
    expectTypeOf(names).toEqualTypeOf<AsyncGenerator<Page<AddressName>, void, undefined>>();
  });

  it("works with a standalone action", () => {
    const pages = paginate(load, {
      name: "ens.eth",
    });
    expectTypeOf(pages).toEqualTypeOf<AsyncGenerator<Page<Subname>, void, undefined>>();
  });

  it("checks the options against the action", () => {
    // @ts-expect-error getSubnames needs a name
    paginate(ens.indexer.getSubnames, { limit: 10 });
  });
});

describe("Indexer.paginate", () => {
  it("streams pages with the loader's error and requirements", () => {
    type Load = (cursor: string | undefined) => Effect.Effect<Page<Subname>, "failed", "Service">;
    const stream = Indexer.paginate({} as Load);

    expectTypeOf(stream).toEqualTypeOf<Stream.Stream<Page<Subname>, "failed", "Service">>();
  });
});
