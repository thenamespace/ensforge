import { Schema } from "effect";

import { IndexerSourcePageStatus } from "./source.js";

export const IndexerCursor = Schema.String.pipe(Schema.brand("IndexerCursor"));
export type IndexerCursor = typeof IndexerCursor.Type;

export const IndexerPageInfo = Schema.Struct({
  cursor: Schema.NullOr(IndexerCursor),
  hasNextPage: Schema.Boolean,
});
export type IndexerPageInfo = typeof IndexerPageInfo.Type;

export interface IndexerPage<Item> {
  readonly items: ReadonlyArray<Item>;
  readonly pageInfo: IndexerPageInfo;
  readonly sources: ReadonlyArray<IndexerSourcePageStatus>;
}

export const IndexerPage = <Item extends Schema.Top>(item: Item) =>
  Schema.Struct({
    items: Schema.Array(item),
    pageInfo: IndexerPageInfo,
    sources: Schema.Array(IndexerSourcePageStatus),
  });
