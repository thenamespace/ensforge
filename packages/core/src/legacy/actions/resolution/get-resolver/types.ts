import type { BlockParameters } from "../../../action/block.js";
import type { CodecError } from "../../../errors/codec-error.js";
import type { ContractError } from "../../../errors/contract-error.js";
import type { NameError } from "../../../errors/name-error.js";
import type { RpcError } from "../../../errors/rpc-error.js";
import type { EthereumAddress } from "../../../schemas/identity.js";

export type GetResolverParameters = {
  readonly name: string;
} & BlockParameters;

export type GetResolverResult = EthereumAddress | null;

export type GetResolverError = CodecError | ContractError | NameError | RpcError;
