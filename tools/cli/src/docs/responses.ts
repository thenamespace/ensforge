/* oxlint-disable effecttsgo/prefer-effect-array, effecttsgo/prefer-effect-string, effecttsgo/prefer-effect-record, effecttsgo/global-json -- synchronous formatting of plain JSON-like values, where native methods read more directly than curried Effect ones */
import { Formatter, Schema } from "effect";

import { fence } from "./mdx.ts";

/**
 * A response recorded from a live call of a read action; `example-responses.json` maps action
 * paths to these. `response` is already written readably (see {@link readable}).
 */
export const ExampleResponse = Schema.Struct({
  /** The code line that made the call. */
  call: Schema.String,
  response: Schema.Unknown,
  /** ISO timestamp of the recording. */
  recordedAt: Schema.String,
  /** Block number the chain was at when the call was made. */
  block: Schema.Finite,
});
export type ExampleResponse = typeof ExampleResponse.Type;

export const ExampleResponses = Schema.Record(Schema.String, ExampleResponse);

/** Writes a result as JSON would: bigints as `"123n"`, bytes as hex, dates as ISO strings. */
export const readable = (value: unknown): unknown => {
  if (typeof value === "bigint") return `${value}n`;
  if (value instanceof Uint8Array) return `0x${Buffer.from(value).toString("hex")}`;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(readable);
  if (typeof value === "object" && value !== null)
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, readable(entry)]),
    );
  return value;
};

/** The "Example response" section of an action page: the call, then the recorded result. */
export const exampleResponseSection = (entry: ExampleResponse): string =>
  [
    "## Example response",
    `Recorded from Ethereum mainnet on ${entry.recordedAt.slice(0, 10)} at block ${entry.block}. Values change as the chain does.`,
    fence("ts", entry.call),
    fence("json", Formatter.formatJson(entry.response, { space: 2 })),
  ].join("\n\n");
