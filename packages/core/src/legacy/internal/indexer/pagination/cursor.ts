import { Array as Arr, Effect, Order, Schema } from "effect";

import { keccak256, stringToHex } from "viem";

import { IndexerCursor } from "../../../actions/indexer/models/index.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import {
  getIndexerRuntimeConfig,
  type IndexerProtocol,
  type IndexerSourceState,
} from "../../../config/indexer-options.js";
import { EnsNetworkIdSchema, type EnsNetworkId } from "../../../config/network.js";
import { IndexerPaginationError } from "../../../errors/indexer-pagination-error.js";
import { Bytes32 } from "../../../schemas/hash.js";

const SourceCursor = Schema.Struct({
  position: Schema.NullOr(Schema.String),
  exhausted: Schema.Boolean,
});

const IndexerCursorPayload = Schema.Struct({
  version: Schema.Literal(1),
  action: Schema.String,
  network: EnsNetworkIdSchema,
  filterFingerprint: Bytes32,
  orderFingerprint: Bytes32,
  sourcesFingerprint: Bytes32,
  sources: Schema.Struct({ v1: SourceCursor, v2: SourceCursor }),
});
export type IndexerCursorPayload = typeof IndexerCursorPayload.Type;

export interface IndexerCursorBinding {
  readonly action: string;
  readonly network: EnsNetworkId;
  readonly filter: unknown;
  readonly order: unknown;
  readonly sources: Readonly<
    Record<
      IndexerProtocol,
      { readonly state: IndexerSourceState; readonly endpoint: string | null }
    >
  >;
}

export interface IndexerCursorPositions {
  readonly v1: { readonly position: string | null; readonly exhausted: boolean };
  readonly v2: { readonly position: string | null; readonly exhausted: boolean };
}

export const makeIndexerCursorBinding = (
  config: EnsforgeConfig,
  action: string,
  filter: unknown,
  order: unknown,
): IndexerCursorBinding => {
  const states = getIndexerRuntimeConfig(config.indexer).sourceStates;

  return {
    action,
    network: config.network,
    filter,
    order,
    sources: {
      v1: { state: states.v1, endpoint: config.indexer.endpoints.v1 },
      v2: { state: states.v2, endpoint: config.indexer.endpoints.v2 },
    },
  };
};

const stableValue = (value: unknown): unknown => {
  if (typeof value === "bigint") return { $bigint: value.toString() };

  if (Array.isArray(value)) return value.map(stableValue);

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, child]) => child !== undefined);

    const sorted = Arr.sort(
      entries,
      Order.mapInput(Order.String, ([key]: [string, unknown]) => key),
    );

    return Object.fromEntries(sorted.map(([key, child]) => [key, stableValue(child)]));
  }

  return value;
};

export const fingerprintIndexerValue = (value: unknown) =>
  keccak256(stringToHex(JSON.stringify(stableValue(value))));

const encodeBase64Url = (value: string): string => {
  let binary = "";

  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
};

const decodeBase64Url = (value: string): string => {
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");

  const binary = atob(padded);

  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
};

const payloadFor = (
  binding: IndexerCursorBinding,
  positions: IndexerCursorPositions,
): IndexerCursorPayload => ({
  version: 1,
  action: binding.action,
  network: binding.network,
  filterFingerprint: fingerprintIndexerValue(binding.filter),
  orderFingerprint: fingerprintIndexerValue(binding.order),
  sourcesFingerprint: fingerprintIndexerValue(binding.sources),
  sources: positions,
});

export const encodeIndexerCursor = Effect.fn("encodeIndexerCursor")(function* (
  binding: IndexerCursorBinding,
  positions: IndexerCursorPositions,
): Effect.fn.Return<IndexerCursor, IndexerPaginationError> {
  return yield* Effect.try({
    try: () =>
      Schema.decodeUnknownSync(IndexerCursor)(
        `v1.${encodeBase64Url(JSON.stringify(payloadFor(binding, positions)))}`,
      ),
    catch: (cause) =>
      new IndexerPaginationError({
        code: "INVALID_CURSOR",
        message: "Unable to encode the indexer cursor",
        cause,
      }),
  });
});

export const decodeIndexerCursor = Effect.fn("decodeIndexerCursor")(function* (
  cursor: string,
  binding: IndexerCursorBinding,
): Effect.fn.Return<IndexerCursorPayload, IndexerPaginationError> {
  const payload = yield* Effect.try({
    try: () => {
      if (!cursor.startsWith("v1.")) throw new Error("Unsupported cursor version");

      return Schema.decodeUnknownSync(IndexerCursorPayload)(
        JSON.parse(decodeBase64Url(cursor.slice(3))),
      );
    },
    catch: (cause) =>
      new IndexerPaginationError({
        code: "INVALID_CURSOR",
        message: "The indexer cursor is invalid or corrupted",
        cause,
      }),
  });

  const expected = payloadFor(binding, payload.sources);

  if (
    payload.action !== expected.action ||
    payload.network !== expected.network ||
    payload.filterFingerprint !== expected.filterFingerprint ||
    payload.orderFingerprint !== expected.orderFingerprint ||
    payload.sourcesFingerprint !== expected.sourcesFingerprint
  ) {
    return yield* new IndexerPaginationError({
      code: "CURSOR_MISMATCH",
      message: "The indexer cursor does not match this query",
    });
  }

  return payload;
});
