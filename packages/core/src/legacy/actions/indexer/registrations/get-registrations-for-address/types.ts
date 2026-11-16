import { Schema } from "effect";

import { EthereumAddress } from "../../../../schemas/identity.js";
import { IndexerCursor } from "../../models/pagination.js";
import { RegistrationOrder } from "../../models/registration.js";
import type { GetRegistrationsError, GetRegistrationsResult } from "../get-registrations/types.js";

const PositivePageSize = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)));

const NonNegativeBigInt = Schema.BigInt.pipe(Schema.check(Schema.isGreaterThanOrEqualToBigInt(0n)));

const AddressRegistrationFilter = Schema.Struct({
  name: Schema.optional(Schema.Never),
  namehash: Schema.optional(Schema.Never),
  protocols: Schema.optional(Schema.Array(Schema.Literals(["v1", "v2"]))),
  registeredAfter: Schema.optional(Schema.Never),
  registeredBefore: Schema.optional(Schema.Never),
  expiryAfter: Schema.optional(NonNegativeBigInt),
  expiryBefore: Schema.optional(NonNegativeBigInt),
});

export const GetRegistrationsForAddressParameters = Schema.Struct({
  address: EthereumAddress,
  filter: Schema.optional(AddressRegistrationFilter),
  order: Schema.optional(RegistrationOrder),
  pageSize: Schema.optional(PositivePageSize),
  cursor: Schema.optional(IndexerCursor),
});
export type GetRegistrationsForAddressParameters = typeof GetRegistrationsForAddressParameters.Type;

export type GetRegistrationsForAddressResult = GetRegistrationsResult;

export type GetRegistrationsForAddressError = GetRegistrationsError;
