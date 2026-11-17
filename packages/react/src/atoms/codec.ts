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

/**
 * Read results as JSON. Only successes are encoded: failures re-run on the client, so errors
 * never cross the server boundary.
 */
export const resultSchema = AsyncResult.Schema({ success: Value });
