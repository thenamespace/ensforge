/* oxlint-disable typescript/no-unsafe-type-assertion -- adapter methods are looked up by name at runtime, so their query and result types are erased */
import { Effect, Predicate, Array as Arr } from "effect";

import { IndexerError } from "../../errors/classes/IndexerError.js";
import { isEnsforgeError } from "../../errors/guards.js";
import type { AnyError } from "../../errors/types.js";
import type { Draft } from "../../indexer/define.js";
import type { Method, Methods } from "../../indexer/Indexer.js";
import type { Meta } from "../../indexer/types.js";

const defaults = {
  asOf: null,
  snapshots: {},
  asOfToken: null,
  completeness: "full",
  unsupportedReason: null,
  unsupportedFields: [],
  origin: null,
} as const satisfies Omit<Meta, "indexer">;

// Answers that may be `null` (not found); the others must be objects.
const nullable = new Set<Method>([
  "getName",
  "getRecords",
  "getRegistry",
  "getResolver",
  "getNamespace",
]);

/**
 * Checks and completes a custom adapter's answer: missing metadata gets its defaults and
 * `indexer` is the adapter id. Pages must carry `items`.
 */
export const complete = <method extends Method>(
  method: method,
  draft: Draft<ReturnType<Methods[method]>>,
  id: string,
): Effect.Effect<ReturnType<Methods[method]>, IndexerError> => {
  const invalid = (shortMessage: string) =>
    Effect.fail(new IndexerError({ code: "INDEXER_RESPONSE_INVALID", source: id, shortMessage }));

  if (draft === null) {
    return nullable.has(method)
      ? Effect.succeed(null as ReturnType<Methods[method]>)
      : invalid(`${id}.${method} answered null.`);
  }
  if (!Predicate.isObject(draft)) return invalid(`${id}.${method} did not answer an object.`);
  if ("items" in draft && !Arr.isArray(draft.items)) {
    return invalid(`${id}.${method} answered a page without an items array.`);
  }

  const meta = method === "getStatus" ? {} : defaults;
  return Effect.succeed({ ...meta, ...draft, indexer: id } as ReturnType<Methods[method]>);
};

/** Errors thrown by a custom adapter: ensforge errors as is, anything else as unavailable. */
export const adapterError = (id: string, method: Method, cause: unknown): AnyError =>
  isEnsforgeError(cause)
    ? cause
    : new IndexerError({
        code: "INDEXER_UNAVAILABLE",
        source: id,
        shortMessage: `${id}.${method} failed.`,
        cause,
      });
