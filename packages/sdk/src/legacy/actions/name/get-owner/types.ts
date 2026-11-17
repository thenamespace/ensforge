import { Schema } from "effect";

import type { BlockParameters } from "../../../action/block.js";
import type { CodecError } from "../../../errors/codec-error.js";
import type { ContractError } from "../../../errors/contract-error.js";
import type { NameError } from "../../../errors/name-error.js";
import type { RpcError } from "../../../errors/rpc-error.js";
import { EthereumAddress } from "../../../schemas/identity.js";
import { NormalizedName } from "../../../schemas/name.js";
import { EnsProtocol } from "../../../schemas/protocol.js";

export const OwnershipLevel = Schema.Literals(["registry", "registrar", "nameWrapper"]);

export type OwnershipLevel = typeof OwnershipLevel.Type;

export const OwnerResult = Schema.Struct({
  name: NormalizedName,
  owner: Schema.NullOr(EthereumAddress),
  registrant: Schema.NullOr(EthereumAddress),
  protocol: EnsProtocol,
  ownershipLevel: OwnershipLevel,
});

export type OwnerResult = typeof OwnerResult.Type;

interface GetOwnerBaseParameters {
  readonly name: string;
}

export type GetOwnerParameters = GetOwnerBaseParameters & BlockParameters;

export type GetOwnerError = CodecError | ContractError | NameError | RpcError;
