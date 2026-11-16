import { Schema } from "effect";

import { Namehash } from "../../../schemas/hash.js";
import { Hex } from "../../../schemas/hex.js";
import { EthereumAddress } from "../../../schemas/identity.js";
import { IndexedNameValue } from "./name.js";
import { IndexedEntitySource } from "./source.js";

const NonNegativeBigInt = Schema.BigInt.pipe(Schema.check(Schema.isGreaterThanOrEqualToBigInt(0n)));

export const IndexedRegistrationCost = Schema.Struct({
  currency: Schema.Literal("native"),
  total: Schema.NullOr(NonNegativeBigInt),
  base: Schema.NullOr(NonNegativeBigInt),
  premium: Schema.NullOr(NonNegativeBigInt),
});
export type IndexedRegistrationCost = typeof IndexedRegistrationCost.Type;

export const IndexedRegistration = Schema.Struct({
  id: Schema.String,
  protocol: Schema.Literals(["v1", "v2"]),
  namehash: Namehash,
  name: IndexedNameValue,
  label: Schema.NullOr(Schema.String),
  registrant: EthereumAddress,
  currentOwner: Schema.NullOr(EthereumAddress),
  registeredAt: NonNegativeBigInt,
  expiry: NonNegativeBigInt,
  cost: IndexedRegistrationCost,
  referrer: Schema.NullOr(Hex),
  source: IndexedEntitySource,
});
export type IndexedRegistration = typeof IndexedRegistration.Type;

export const RegistrationFilter = Schema.Struct({
  name: Schema.optional(Schema.Never),
  namehash: Schema.optional(Schema.Never),
  registrant: Schema.optional(EthereumAddress),
  protocols: Schema.optional(Schema.Array(Schema.Literals(["v1", "v2"]))),
  registeredAfter: Schema.optional(Schema.Never),
  registeredBefore: Schema.optional(Schema.Never),
  expiryAfter: Schema.optional(NonNegativeBigInt),
  expiryBefore: Schema.optional(NonNegativeBigInt),
});
export type RegistrationFilter = typeof RegistrationFilter.Type;

export const RegistrationOrder = Schema.Struct({
  field: Schema.Literals(["registeredAt", "expiry", "name"]),
  direction: Schema.Literals(["asc", "desc"]),
});
export type RegistrationOrder = typeof RegistrationOrder.Type;

export const defaultRegistrationOrder = Object.freeze({
  field: "registeredAt",
  direction: "desc",
}) satisfies RegistrationOrder;
