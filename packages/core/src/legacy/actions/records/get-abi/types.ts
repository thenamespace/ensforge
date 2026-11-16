import { Schema } from "effect";

import type { BlockParameters } from "../../../action/block.js";
import type { CodecError } from "../../../errors/codec-error.js";
import type { ContractError } from "../../../errors/contract-error.js";
import type { NameError } from "../../../errors/name-error.js";
import type { RpcError } from "../../../errors/rpc-error.js";
import { Abi, AbiRecordData, type AbiContentType } from "../../../schemas/records.js";

const InlineAbiResult = Schema.Struct({
  contentType: Schema.Literals(["json", "zlib-json", "cbor"]),
  value: Abi,
  raw: AbiRecordData,
});

const UriAbiResult = Schema.Struct({
  contentType: Schema.Literal("uri"),
  value: Schema.String,
  raw: AbiRecordData,
});

const UnsetAbiResult = Schema.Struct({
  contentType: Schema.Null,
  value: Schema.Null,
  raw: Schema.Null,
});

export const AbiResult = Schema.Union([InlineAbiResult, UriAbiResult, UnsetAbiResult]);

export type AbiResult = typeof AbiResult.Type;

export type GetAbiParameters = {
  readonly name: string;
  readonly contentTypes?: ReadonlyArray<AbiContentType>;
} & BlockParameters;

export type GetAbiError = CodecError | ContractError | NameError | RpcError;
