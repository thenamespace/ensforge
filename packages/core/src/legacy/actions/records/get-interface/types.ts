import { Schema } from "effect";

import type { BlockParameters } from "../../../action/block.js";
import type { CodecError } from "../../../errors/codec-error.js";
import type { ContractError } from "../../../errors/contract-error.js";
import type { NameError } from "../../../errors/name-error.js";
import type { RpcError } from "../../../errors/rpc-error.js";
import { EthereumAddress } from "../../../schemas/identity.js";
import { InterfaceId } from "../../../schemas/records.js";

export const InterfaceResult = Schema.Struct({
  interfaceId: InterfaceId,
  implementer: Schema.NullOr(EthereumAddress),
});

export type InterfaceResult = typeof InterfaceResult.Type;

export type GetInterfaceParameters = {
  readonly name: string;
  readonly interfaceId: string;
} & BlockParameters;

export type GetInterfaceError = CodecError | ContractError | NameError | RpcError;
