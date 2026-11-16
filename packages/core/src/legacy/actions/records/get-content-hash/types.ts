import { Schema } from "effect";

import type { BlockParameters } from "../../../action/block.js";
import type { CodecError } from "../../../errors/codec-error.js";
import type { ContractError } from "../../../errors/contract-error.js";
import type { NameError } from "../../../errors/name-error.js";
import type { RpcError } from "../../../errors/rpc-error.js";
import { ContentHash, ContentHashProtocol } from "../../../schemas/records.js";

const SetContentHashResult = Schema.Struct({
  protocol: ContentHashProtocol,
  value: Schema.String,
  raw: ContentHash,
});

const UnsetContentHashResult = Schema.Struct({
  protocol: Schema.Null,
  value: Schema.Null,
  raw: Schema.Null,
});

export const ContentHashResult = Schema.Union([SetContentHashResult, UnsetContentHashResult]);

export type ContentHashResult = typeof ContentHashResult.Type;

export type GetContentHashParameters = {
  readonly name: string;
} & BlockParameters;

export type GetContentHashError = CodecError | ContractError | NameError | RpcError;
