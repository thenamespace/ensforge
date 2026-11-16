import { Schema } from "effect";

import type { BlockParameters } from "../../../action/block.js";
import type { CodecError } from "../../../errors/codec-error.js";
import type { ContractError } from "../../../errors/contract-error.js";
import type { NameError } from "../../../errors/name-error.js";
import type { RpcError } from "../../../errors/rpc-error.js";
import { NormalizedName } from "../../../schemas/name.js";
import { EnsProtocol } from "../../../schemas/protocol.js";

export const ExpirySource = Schema.Literals(["baseRegistrar", "nameWrapper", "registry"]);

export type ExpirySource = typeof ExpirySource.Type;

export const ExpiryResult = Schema.Struct({
  name: NormalizedName,
  expiry: Schema.BigInt,
  gracePeriod: Schema.BigInt,
  gracePeriodEnd: Schema.BigInt,
  protocol: EnsProtocol,
  source: ExpirySource,
});

export type ExpiryResult = typeof ExpiryResult.Type;

export type GetExpiryParameters = {
  readonly name: string;
} & BlockParameters;

export type GetExpiryError = CodecError | ContractError | NameError | RpcError;
