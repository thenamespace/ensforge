import { Effect, Schema } from "effect";

import type { IndexedName, NameOrder } from "../../../actions/indexer/models/index.js";
import { IndexerPaginationError } from "../../../errors/indexer-pagination-error.js";
import { Namehash } from "../../../schemas/hash.js";
import type { V1NameWhere } from "../query/name-filter.js";

const V1NamePosition = Schema.Struct({
  field: Schema.Literals(["createdAt", "name", "expiry"]),
  value: Schema.NullOr(Schema.String),
  namehash: Namehash,
});
export type V1NamePosition = typeof V1NamePosition.Type;

const orderValue = (name: IndexedName, order: NameOrder): string | null => {
  switch (order.field) {
    case "createdAt":
      return name.createdAt.toString();
    case "name":
      return name.name.kind === "unknown" ? null : name.name.value;
    case "expiry":
      return name.expiry?.toString() ?? null;
  }
};

export const encodeV1NamePosition = (name: IndexedName, order: NameOrder): string =>
  JSON.stringify({ field: order.field, value: orderValue(name, order), namehash: name.namehash });

export const decodeV1NamePosition = Effect.fn("decodeV1NamePosition")(function* (
  position: string,
  order: NameOrder,
): Effect.fn.Return<V1NamePosition, IndexerPaginationError> {
  const decoded = yield* Effect.try({
    try: () => Schema.decodeUnknownSync(V1NamePosition)(JSON.parse(position)),
    catch: (cause) =>
      new IndexerPaginationError({
        code: "INVALID_CURSOR",
        message: "The V1 indexer position is invalid",
        cause,
      }),
  });

  if (decoded.field !== order.field) {
    return yield* new IndexerPaginationError({
      code: "CURSOR_MISMATCH",
      message: "The V1 indexer position does not match the requested order",
    });
  }

  return decoded;
});

export const compileV1NamePosition = (position: V1NamePosition, order: NameOrder): V1NameWhere => {
  const field =
    order.field === "createdAt" ? "createdAt" : order.field === "expiry" ? "expiryDate" : "name";

  const direction = order.direction === "asc" ? "gt" : "lt";
  const idDirection = order.direction === "asc" ? "id_gt" : "id_lt";

  if (position.value === null) return { [field]: null, [idDirection]: position.namehash };

  const after: Array<Record<string, unknown>> = [
    { [`${field}_${direction}`]: position.value },
    { [field]: position.value, [idDirection]: position.namehash },
  ];

  if (order.direction === "desc") after.push({ [field]: null });

  return { or: after };
};

export const combineV1NameWhere = (
  filter: V1NameWhere,
  position: V1NameWhere | undefined,
): V1NameWhere => (position === undefined ? filter : { and: [filter, position] });
