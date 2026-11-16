import { Array as Arr, Effect, Order } from "effect";

import type { IndexerSourcePageStatus } from "../../../actions/indexer/models/source.js";
import type { IndexerFailureMode, IndexerProtocol } from "../../../config/indexer-options.js";

export interface IndexerMergeCandidate<Item> {
  readonly item: Item;
  readonly position: string;
}

export interface IndexerMergeSource<Item> {
  readonly protocol: IndexerProtocol;
  readonly candidates: ReadonlyArray<IndexerMergeCandidate<Item>>;
  readonly hasNextPage: boolean;
}

export interface IndexerMergeResult<Item> {
  readonly items: ReadonlyArray<Item>;
  readonly positions: Readonly<Partial<Record<IndexerProtocol, string>>>;
  readonly hasNextPage: boolean;
}

export interface MergeIndexerPagesOptions<Item> {
  readonly sources: ReadonlyArray<IndexerMergeSource<Item>>;
  readonly limit: number;
  readonly compare: (left: Item, right: Item) => number;
  readonly identity: (item: Item) => string;
  readonly preference?: (item: Item, protocol: IndexerProtocol) => number;
}

export const mergeIndexerPages = <Item>({
  sources,
  limit,
  compare,
  identity,
  preference = (_item, protocol) => (protocol === "v2" ? 1 : 0),
}: MergeIndexerPagesOptions<Item>): IndexerMergeResult<Item> => {
  const offsets = new Map(sources.map((source) => [source.protocol, 0]));
  const positions: Partial<Record<IndexerProtocol, string>> = {};
  const items: Array<Item> = [];

  const preferredCandidates = new Map<
    string,
    { readonly item: Item; readonly protocol: IndexerProtocol }
  >();

  for (const source of sources) {
    for (const { item } of source.candidates) {
      const itemIdentity = identity(item);
      const preferred = preferredCandidates.get(itemIdentity);

      if (
        preferred === undefined ||
        preference(item, source.protocol) > preference(preferred.item, preferred.protocol)
      ) {
        preferredCandidates.set(itemIdentity, { item, protocol: source.protocol });
      }
    }
  }

  while (items.length < limit) {
    type Head = {
      readonly source: IndexerMergeSource<Item>;
      readonly candidate: IndexerMergeCandidate<Item>;
    };

    const heads: Array<Head> = sources.flatMap((source) => {
      const offset = offsets.get(source.protocol) ?? 0;
      const candidate = source.candidates[offset];

      return candidate === undefined ? [] : [{ source, candidate }];
    });

    if (heads.length === 0) break;

    const sortedHeads = Arr.sort(
      heads,
      Order.make<Head>((left, right) => {
        const compared = compare(left.candidate.item, right.candidate.item);

        return compared < 0 ? -1 : compared > 0 ? 1 : 0;
      }),
    );

    const [first] = sortedHeads;

    if (first === undefined) break;

    const nextIdentity = identity(first.candidate.item);
    const preferred = preferredCandidates.get(nextIdentity);

    if (
      preferred !== undefined &&
      preference(first.candidate.item, first.source.protocol) <
        preference(preferred.item, preferred.protocol)
    ) {
      offsets.set(first.source.protocol, (offsets.get(first.source.protocol) ?? 0) + 1);
      positions[first.source.protocol] = first.candidate.position;

      continue;
    }

    const duplicates = sortedHeads.filter(
      ({ candidate }) => identity(candidate.item) === nextIdentity,
    );

    const selected = duplicates.reduce((best, candidate) =>
      preference(candidate.candidate.item, candidate.source.protocol) >
      preference(best.candidate.item, best.source.protocol)
        ? candidate
        : best,
    );

    items.push(selected.candidate.item);

    for (const { source, candidate } of duplicates) {
      offsets.set(source.protocol, (offsets.get(source.protocol) ?? 0) + 1);
      positions[source.protocol] = candidate.position;
    }
  }

  const hasNextPage = sources.some((source) => {
    const offset = offsets.get(source.protocol) ?? 0;

    return offset < source.candidates.length || source.hasNextPage;
  });

  return { items, positions, hasNextPage };
};

export type IndexerSourcePageResult<Item, Error> =
  | {
      readonly status: "complete";
      readonly page: IndexerMergeSource<Item>;
      readonly metadata: IndexerSourcePageStatus;
    }
  | {
      readonly status: "failed";
      readonly error: Error;
      readonly metadata: IndexerSourcePageStatus;
    }
  | {
      readonly status: "disabled" | "unavailable";
      readonly metadata: IndexerSourcePageStatus;
    };

export const collectIndexerSourcePages = Effect.fn("collectIndexerSourcePages")(function* <
  Item,
  Error,
>(
  results: ReadonlyArray<IndexerSourcePageResult<Item, Error>>,
  failureMode: IndexerFailureMode,
): Effect.fn.Return<
  {
    readonly pages: ReadonlyArray<IndexerMergeSource<Item>>;
    readonly sources: ReadonlyArray<IndexerSourcePageStatus>;
  },
  Error
> {
  const pages: Array<IndexerMergeSource<Item>> = [];
  const sources: Array<IndexerSourcePageStatus> = [];

  for (const result of results) {
    sources.push(result.metadata);

    if (result.status === "complete") pages.push(result.page);

    if (result.status === "failed" && failureMode === "strict")
      return yield* Effect.fail(result.error);
  }

  return { pages, sources };
});
