import { Effect, Result, Schema } from "effect";

import { getAddress } from "viem";
import { namehash, normalize } from "viem/ens";

import { defineAction } from "../../../../action/action.js";
import type { EnsforgeConfig } from "../../../../config/config.js";
import { getIndexerRuntimeConfig } from "../../../../config/indexer-options.js";
import { IndexerConfigError } from "../../../../errors/indexer-config-error.js";
import { IndexerFilterError } from "../../../../errors/indexer-filter-error.js";
import type { Namehash } from "../../../../schemas/hash.js";
import {
  GetIndexedResolverParameters as GetIndexedResolverParametersSchema,
  type GetIndexedResolverError,
  type GetIndexedResolverParameters,
  type GetIndexedResolverResult,
} from "./types.js";
import { queryV1IndexedResolver } from "./v1.js";
import { queryV2IndexedResolver } from "./v2.js";

const getIndexedResolverEffect = Effect.fn("ensforge.getIndexedResolver")(function* (
  config: EnsforgeConfig,
  parameters: GetIndexedResolverParameters,
): Effect.fn.Return<GetIndexedResolverResult, GetIndexedResolverError> {
  if (!config.indexer.enabled) {
    return yield* new IndexerConfigError({
      code: "INDEXER_DISABLED",
      message: "Indexer actions are disabled for this configuration",
    });
  }

  const decoded = yield* Schema.decodeUnknownEffect(GetIndexedResolverParametersSchema)(
    parameters,
  ).pipe(
    Effect.mapError(
      () =>
        new IndexerFilterError({
          code: "INVALID_FILTER",
          message: "The indexed resolver query parameters are invalid",
        }),
    ),
  );

  const address = getAddress(decoded.address);

  const bindingNamehash = yield* Effect.try({
    try: (): Namehash | null =>
      decoded.namehash ??
      (decoded.name === undefined ? null : (namehash(normalize(decoded.name)) as Namehash)),
    catch: () =>
      new IndexerFilterError({
        code: "INVALID_FILTER",
        message: "The resolver binding name is invalid",
      }),
  });

  const states = getIndexerRuntimeConfig(config.indexer).sourceStates;

  if (states.v2 === "enabled") {
    const result = yield* Effect.result(
      queryV2IndexedResolver(config, address, decoded.protocol, bindingNamehash),
    );

    if (Result.isSuccess(result) && result.success !== null) return result.success;

    if (Result.isFailure(result) && config.indexer.failureMode === "strict") {
      return yield* result.failure;
    }
  }

  if (decoded.protocol === "v2" || states.v1 !== "enabled") return null;

  return yield* queryV1IndexedResolver(config, address, bindingNamehash).pipe(
    config.indexer.failureMode === "partial"
      ? Effect.orElseSucceed(() => null)
      : (effect) => effect,
  );
});

export const getIndexedResolver = defineAction(getIndexedResolverEffect);

export {
  GetIndexedResolverParameters,
  GetIndexedResolverResult,
  type GetIndexedResolverError,
  type GetIndexedResolverParameters as GetIndexedResolverParametersType,
  type GetIndexedResolverResult as GetIndexedResolverResultType,
} from "./types.js";
