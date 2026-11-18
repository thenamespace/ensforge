import { Array as Arr, Predicate, Record as Rec, Schema, SchemaTransformation } from "effect";
import { AsyncResult } from "effect/reactivity";

import { bytesToHex, hexToBytes, isHex } from "viem";

// ensforge values hold bigints and bytes, which JSON lacks; they travel as tagged objects.
const bigintTag = "~bigint";
const bytesTag = "~bytes";

const toJson = (value: unknown): Schema.Json => {
  if (typeof value === "bigint") return { [bigintTag]: value.toString() };
  if (value instanceof Uint8Array) return { [bytesTag]: bytesToHex(value) };
  if (value instanceof Date) return value.toISOString();
  if (Arr.isArray(value)) return Arr.map(value, toJson);
  if (Predicate.isObject(value)) {
    const fields = Arr.filter(Rec.toEntries(value), ([, field]) => field !== undefined);
    return Rec.fromEntries(Arr.map(fields, ([field, item]) => [field, toJson(item)] as const));
  }
  // Other primitives pass through as before; encoding validates them against `Schema.Json`.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as Schema.Json;
};

const fromJson = (value: unknown): unknown => {
  if (Arr.isArray(value)) return Arr.map(value, fromJson);
  if (!Predicate.isObject(value)) return value;

  const bigint = value[bigintTag];
  if (typeof bigint === "string") return BigInt(bigint);
  const bytes = value[bytesTag];
  if (typeof bytes === "string" && isHex(bytes)) return hexToBytes(bytes);
  return Rec.fromEntries(
    Arr.map(Rec.toEntries(value), ([field, item]) => [field, fromJson(item)] as const),
  );
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
      decode: (result: AsyncResult.AsyncResult<unknown>): unknown => {
        hydrated.add(result);
        return result;
      },
      // Only results reach this schema, so the `Unknown` side is always an AsyncResult.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      encode: (result: unknown) => result as AsyncResult.AsyncResult<unknown>,
    }),
  ),
);
