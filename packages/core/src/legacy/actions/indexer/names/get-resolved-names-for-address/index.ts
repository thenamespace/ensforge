import { Effect, Schema } from "effect";

import { defineAction } from "../../../../action/action.js";
import type { EnsforgeConfig } from "../../../../config/config.js";
import { IndexerFilterError } from "../../../../errors/indexer-filter-error.js";
import { EthereumAddress } from "../../../../schemas/identity.js";
import { IndexedResolvedName } from "../../models/name.js";
import {
  IndexerCursor,
  IndexerPage,
  type IndexerPage as IndexerPageType,
} from "../../models/pagination.js";
import { NameFilter, NameOrder } from "../../models/query.js";
import { getNamesForAddress } from "../get-names-for-address/index.js";
import type { GetNamesForAddressError } from "../get-names-for-address/types.js";

const PositivePageSize = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)));

export const GetResolvedNamesForAddressParameters = Schema.Struct({
  address: EthereumAddress,
  filter: Schema.optional(NameFilter),
  order: Schema.optional(NameOrder),
  pageSize: Schema.optional(PositivePageSize),
  cursor: Schema.optional(IndexerCursor),
});
export type GetResolvedNamesForAddressParameters = typeof GetResolvedNamesForAddressParameters.Type;

export const GetResolvedNamesForAddressResult = IndexerPage(IndexedResolvedName);
export type GetResolvedNamesForAddressResult = IndexerPageType<typeof IndexedResolvedName.Type>;

export type GetResolvedNamesForAddressError = GetNamesForAddressError;

const getResolvedNamesForAddressEffect = Effect.fn("ensforge.getResolvedNamesForAddress")(
  function* (
    config: EnsforgeConfig,
    parameters: GetResolvedNamesForAddressParameters,
  ): Effect.fn.Return<GetResolvedNamesForAddressResult, GetResolvedNamesForAddressError> {
    const decoded = yield* Schema.decodeUnknownEffect(GetResolvedNamesForAddressParameters)(
      parameters,
    ).pipe(
      Effect.mapError(
        () =>
          new IndexerFilterError({
            code: "INVALID_FILTER",
            message: "The resolved-name query parameters are invalid",
          }),
      ),
    );

    const page = yield* getNamesForAddress.effect(config, {
      ...decoded,
      relations: ["resolved-address"],
    });

    return {
      ...page,
      items: page.items.map((name) => ({
        name,
        address: decoded.address,
        verification: "indexed-unverified" as const,
      })),
    };
  },
);

export const getResolvedNamesForAddress = defineAction(getResolvedNamesForAddressEffect);
