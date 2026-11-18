import { Schema, SchemaTransformation } from "effect";
import { AsyncResult } from "effect/reactivity";

import { bytesToHex, hexToBytes, type Hex } from "viem";

// ensforge values hold bigints and bytes, which JSON lacks; they travel as tagged objects.
const bigintTag = "~bigint";
const bytesTag = "~bytes";

const toJson = (value: unknown): Schema.Json => {
  if (typeof value === "bigint") return { [bigintTag]: value.toString() };
  if (value instanceof Uint8Array) return { [bytesTag]: bytesToHex(value) };
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJson);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, field]) => field !== undefined)
        .map(([field, item]) => [field, toJson(item)]),
    );
  }
  return value as Schema.Json;
};

const fromJson = (value: Schema.Json): unknown => {
  if (Array.isArray(value)) return value.map(fromJson);
  if (typeof value !== "object" || value === null) return value;

  const tagged = value as Readonly<Record<string, Schema.Json>>;
  if (typeof tagged[bigintTag] === "string") return BigInt(tagged[bigintTag]);
  if (typeof tagged[bytesTag] === "string") return hexToBytes(tagged[bytesTag] as Hex);
  return Object.fromEntries(Object.entries(tagged).map(([field, item]) => [field, fromJson(item)]));
};

/** Any ensforge value as JSON, for server-rendered reads. */
const Value = Schema.Json.pipe(
  Schema.decodeTo(
    Schema.Unknown,
    SchemaTransformation.transform({ decode: fromJson, encode: toJson }),
  ),
);

// Results decoded from server-rendered state, until a refetch replaces them.
const hydrated = new WeakSet<AsyncResult.AsyncResult<unknown, unknown>>();

/**
 * Whether a read's result came from the server through hydration.
 *
 * @stability unstable
 */
export const isHydrated = (result: AsyncResult.AsyncResult<unknown, unknown>): boolean =>
  hydrated.has(result);

const Result = AsyncResult.Schema({ success: Value });

/**
 * Read results as JSON. Only successes are encoded: failures re-run on the client, so errors
 * never cross the server boundary. Decoded results are marked for {@link isHydrated}.
 *
 * @stability unstable
 */
export const resultSchema = Result.pipe(
  // To `Unknown`: decoding to `Result`'s type would rebuild the result and lose the mark.
  Schema.decodeTo(
    Schema.Unknown,
    SchemaTransformation.transform({
      decode: (result: AsyncResult.AsyncResult<unknown, never>): unknown => {
        hydrated.add(result);
        return result;
      },
      encode: (result: unknown) => result as AsyncResult.AsyncResult<unknown, never>,
    }),
  ),
);
