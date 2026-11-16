import { Effect, Result, Schema } from "effect";

import { labelhash, namehash, normalize } from "viem/ens";

import { defineAction } from "../../../../action/action.js";
import type { EnsforgeConfig } from "../../../../config/config.js";
import { getIndexerRuntimeConfig } from "../../../../config/indexer-options.js";
import { IndexerFilterError } from "../../../../errors/indexer-filter-error.js";
import { Labelhash, Namehash } from "../../../../schemas/hash.js";
import { getIndexedName } from "../get-indexed-name/index.js";
import {
  GetDecodedNameParameters as GetDecodedNameParametersSchema,
  type GetDecodedNameError,
  type GetDecodedNameParameters,
  type GetDecodedNameResult,
} from "./types.js";
import { getV1Label } from "./v1.js";

const encodedLabel = /^\[([0-9a-fA-F]{64})\]$/u;

const getDecodedNameEffect = Effect.fn("ensforge.getDecodedName")(function* (
  config: EnsforgeConfig,
  parameters: GetDecodedNameParameters,
): Effect.fn.Return<GetDecodedNameResult, GetDecodedNameError> {
  const decoded = yield* Schema.decodeUnknownEffect(GetDecodedNameParametersSchema)(
    parameters,
  ).pipe(
    Effect.mapError(
      () =>
        new IndexerFilterError({
          code: "INVALID_FILTER",
          message: "The encoded-name parameters are invalid",
        }),
    ),
  );

  const labels = decoded.name.split(".");

  const encoded = labels.flatMap((label, index) => {
    const match = encodedLabel.exec(label);

    return match?.[1] === undefined ? [] : [{ index, hash: `0x${match[1]}` }];
  });

  if (encoded.length === 0) {
    return yield* Effect.try({
      try: () => normalize(decoded.name),
      catch: () =>
        new IndexerFilterError({ code: "INVALID_FILTER", message: "The name is invalid" }),
    });
  }

  const hash = yield* Effect.try({
    try: () => Schema.decodeUnknownSync(Namehash)(namehash(decoded.name)),
    catch: () =>
      new IndexerFilterError({ code: "INVALID_FILTER", message: "The encoded name is invalid" }),
  });

  const indexed = yield* Effect.result(getIndexedName.effect(config, { namehash: hash }));

  if (Result.isSuccess(indexed) && indexed.success?.name.kind === "normalized") {
    return indexed.success.name.value;
  }

  if (Result.isFailure(indexed) && config.indexer.failureMode === "strict") {
    return yield* indexed.failure;
  }

  if (Result.isSuccess(indexed) && indexed.success?.name.kind === "encoded") {
    const known = indexed.success.name.value.split(".");

    for (const [index, label] of known.entries()) {
      if (!encodedLabel.test(label)) labels[index] = label;
    }
  }

  const unresolved = encoded.filter(({ index }) => encodedLabel.test(labels[index] ?? ""));

  if (unresolved.length === 0) {
    return yield* Effect.try({
      try: () => normalize(labels.join(".")),
      catch: () =>
        new IndexerFilterError({ code: "INVALID_FILTER", message: "The decoded name is invalid" }),
    });
  }

  if (getIndexerRuntimeConfig(config.indexer).sourceStates.v1 === "enabled") {
    const recovered = yield* Effect.all(
      unresolved.map(({ index, hash: rawHash }) => {
        const labelHash = Schema.decodeUnknownSync(Labelhash)(rawHash);

        return Effect.result(getV1Label(config, labelHash)).pipe(
          Effect.map((result) => ({ index, labelHash, result })),
        );
      }),
      { concurrency: "unbounded" },
    );

    for (const { index, labelHash, result } of recovered) {
      if (Result.isFailure(result)) {
        if (config.indexer.failureMode === "strict") return yield* result.failure;

        continue;
      }

      if (
        result.success !== null &&
        labelhash(result.success).toLowerCase() === labelHash.toLowerCase()
      ) {
        labels[index] = result.success;
      }
    }
  }

  const value = labels.join(".");

  if (labels.every((label) => !encodedLabel.test(label))) {
    return yield* Effect.try({
      try: () => normalize(value),
      catch: () =>
        new IndexerFilterError({ code: "INVALID_FILTER", message: "The decoded name is invalid" }),
    });
  }

  return decoded.allowIncomplete === true ? value : null;
});

export const getDecodedName = defineAction(getDecodedNameEffect);

export {
  GetDecodedNameParameters,
  type GetDecodedNameError,
  type GetDecodedNameParameters as GetDecodedNameParametersType,
  type GetDecodedNameResult,
} from "./types.js";
