import { Effect, Schema } from "effect";

import { getAddress } from "viem";

import { defineAction } from "../../../../action/action.js";
import type { EnsforgeConfig } from "../../../../config/config.js";
import { IndexerConfigError } from "../../../../errors/indexer-config-error.js";
import { IndexerDecodeError } from "../../../../errors/indexer-decode-error.js";
import { IndexerFilterError } from "../../../../errors/indexer-filter-error.js";
import { requestIndexer } from "../../../../internal/indexer/client.js";
import {
  V2GetRegistryLabelsDocument,
  type V2GetRegistryLabelsQuery,
  type V2GetRegistryLabelsQueryVariables,
  V2GetRegistryReferencesDocument,
  type V2GetRegistryReferencesQuery,
  type V2GetRegistryReferencesQueryVariables,
} from "../../../../internal/indexer/generated/v2/get-registry-labels.js";
import { normalizeV2IndexerName } from "../../../../internal/indexer/normalize/v2-name.js";
import {
  decodeIndexerCursor,
  encodeIndexerCursor,
  makeIndexerCursorBinding,
} from "../../../../internal/indexer/pagination/cursor.js";
import { decodeIndexedBlock, requireIndexerData } from "../../../../internal/indexer/response.js";
import { getV2IndexerUnsupported } from "../../../../internal/indexer/v2-support.js";
import type { RegistryNameRelationship } from "../../models/registry.js";
import {
  GetRegistryLabelsParameters as GetRegistryLabelsParametersSchema,
  type GetRegistryLabelsError,
  type GetRegistryLabelsParameters,
  type GetRegistryLabelsResult,
} from "./types.js";

const getRegistryLabelsEffect = Effect.fn("ensforge.getRegistryLabels")(function* (
  config: EnsforgeConfig,
  parameters: GetRegistryLabelsParameters,
): Effect.fn.Return<GetRegistryLabelsResult, GetRegistryLabelsError> {
  if (!config.indexer.enabled) {
    return yield* new IndexerConfigError({
      code: "INDEXER_DISABLED",
      message: "Indexer actions are disabled for this configuration",
    });
  }

  const decoded = yield* Schema.decodeUnknownEffect(GetRegistryLabelsParametersSchema)(
    parameters,
  ).pipe(
    Effect.mapError(
      () =>
        new IndexerFilterError({
          code: "INVALID_FILTER",
          message: "The registry label query parameters are invalid",
        }),
    ),
  );

  const unsupported = getV2IndexerUnsupported(config);

  if (unsupported !== null) return unsupported;

  const address = getAddress(decoded.address);
  const relationship: RegistryNameRelationship = decoded.relationship ?? "label";
  const pageSize = decoded.pageSize ?? Math.min(20, config.indexer.maximumPageSize);

  if (pageSize > config.indexer.maximumPageSize) {
    return yield* new IndexerFilterError({
      code: "INVALID_FILTER",
      message: `pageSize cannot exceed ${config.indexer.maximumPageSize}`,
    });
  }

  const binding = makeIndexerCursorBinding(
    config,
    "getRegistryLabels",
    { address, relationship },
    null,
  );

  const positions =
    decoded.cursor === undefined
      ? { v1: { position: null, exhausted: true }, v2: { position: null, exhausted: false } }
      : (yield* decodeIndexerCursor(decoded.cursor, binding)).sources;

  const operationName =
    relationship === "label" ? "V2GetRegistryLabels" : "V2GetRegistryReferences";

  const queryVariables = {
    address: address.toLowerCase(),
    first: pageSize,
    after: positions.v2.position,
  };

  const data =
    relationship === "label"
      ? yield* Effect.gen(function* () {
          const response = yield* requestIndexer<
            V2GetRegistryLabelsQuery,
            V2GetRegistryLabelsQueryVariables
          >(config, {
            protocol: "v2",
            operationName,
            document: V2GetRegistryLabelsDocument,
            variables: queryVariables,
          });

          const result = yield* requireIndexerData(config, "v2", operationName, response);

          return {
            indexedBlock: result["_meta"].block.number,
            connection: result.registry?.labelConnection,
          };
        })
      : yield* Effect.gen(function* () {
          const response = yield* requestIndexer<
            V2GetRegistryReferencesQuery,
            V2GetRegistryReferencesQueryVariables
          >(config, {
            protocol: "v2",
            operationName,
            document: V2GetRegistryReferencesDocument,
            variables: queryVariables,
          });

          const result = yield* requireIndexerData(config, "v2", operationName, response);

          return {
            indexedBlock: result["_meta"].block.number,
            connection: result.registry?.referencedByConnection,
          };
        });

  const indexedBlock = yield* decodeIndexedBlock(config, "v2", operationName, data.indexedBlock);
  const connection = data.connection;
  const edges = connection?.edges ?? [];

  const items = yield* Effect.all(
    edges.map(({ node }) =>
      normalizeV2IndexerName(node, {
        network: config.network,
        protocol: "v2",
        indexedBlock,
        operationName,
      }).pipe(
        Effect.flatMap((name) =>
          name.protocol === "v2"
            ? Effect.succeed({ relationship, name } as const)
            : Effect.fail(
                new IndexerDecodeError({
                  code: "INVALID_RESPONSE",
                  message: "The V2 registry returned a non-V2 label",
                  network: config.network,
                  protocol: "v2",
                  operationName,
                  cause: node,
                }),
              ),
        ),
      ),
    ),
    { concurrency: "unbounded" },
  );

  const hasNextPage = connection?.pageInfo.hasNextPage ?? false;
  const nextPosition = connection?.pageInfo.endCursor ?? null;

  if (hasNextPage && (nextPosition === null || nextPosition === positions.v2.position)) {
    return yield* new IndexerDecodeError({
      code: "INVALID_RESPONSE",
      message: "The V2 indexer returned a non-advancing registry-label cursor",
      network: config.network,
      protocol: "v2",
      operationName,
      cause: connection?.pageInfo,
    });
  }

  const cursor = hasNextPage
    ? yield* encodeIndexerCursor(binding, {
        v1: { position: null, exhausted: true },
        v2: { position: nextPosition, exhausted: false },
      })
    : null;

  return {
    status: "supported",
    value: {
      items,
      pageInfo: { cursor, hasNextPage },
      sources: [{ protocol: "v2", status: "complete", indexedBlock, hasNextPage }],
    },
  };
});

export const getRegistryLabels = defineAction(getRegistryLabelsEffect);

export {
  GetRegistryLabelsPage,
  GetRegistryLabelsParameters,
  GetRegistryLabelsResult,
  type GetRegistryLabelsError,
  type GetRegistryLabelsPage as GetRegistryLabelsPageType,
  type GetRegistryLabelsParameters as GetRegistryLabelsParametersType,
  type GetRegistryLabelsResult as GetRegistryLabelsResultType,
} from "./types.js";
