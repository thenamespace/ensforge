import { Schema } from "effect";

import { EthereumAddress } from "../../../schemas/identity.js";

const NonNegativeBigInt = Schema.BigInt.pipe(Schema.check(Schema.isGreaterThanOrEqualToBigInt(0n)));

export const NameSearchMode = Schema.Literals(["contains", "starts-with", "ends-with"]);
export type NameSearchMode = typeof NameSearchMode.Type;

export const NameSearch = Schema.Struct({
  field: Schema.Literals(["name", "label"]),
  mode: NameSearchMode,
  value: Schema.String,
});
export type NameSearch = typeof NameSearch.Type;

export const NameFilter = Schema.Struct({
  name: Schema.optional(Schema.String),
  label: Schema.optional(Schema.String),
  search: Schema.optional(NameSearch),
  owner: Schema.optional(EthereumAddress),
  resolvedAddress: Schema.optional(EthereumAddress),
  resolver: Schema.optional(EthereumAddress),
  protocol: Schema.optional(Schema.Literals(["v1", "v2"])),
  /** Migration from ENSv1 to ENSv2, not the historical V1 registry migration. */
  migrated: Schema.optional(Schema.Boolean),
  includeUnreachable: Schema.optional(Schema.Boolean),
  /** Exclusive lower bound; names without a recorded expiry are included. */
  expiryAfter: Schema.optional(NonNegativeBigInt),
  /** Exclusive upper bound; requires a recorded expiry. */
  expiryBefore: Schema.optional(NonNegativeBigInt),
});
export type NameFilter = typeof NameFilter.Type;

export const NameOrderField = Schema.Literals(["createdAt", "name", "expiry"]);
export type NameOrderField = typeof NameOrderField.Type;

export const NameOrder = Schema.Struct({
  field: NameOrderField,
  direction: Schema.Literals(["asc", "desc"]),
});
export type NameOrder = typeof NameOrder.Type;

export const defaultNameOrder = Object.freeze({
  field: "createdAt",
  direction: "desc",
}) satisfies NameOrder;
