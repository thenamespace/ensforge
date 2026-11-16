import { Schema } from "effect";

import type { BlockParameters } from "../../../action/block.js";
import type { CodecError } from "../../../errors/codec-error.js";
import type { ContractError } from "../../../errors/contract-error.js";
import type { NameError } from "../../../errors/name-error.js";
import type { RpcError } from "../../../errors/rpc-error.js";
import { CoinType } from "../../../schemas/coin-type.js";
import { AddressRecordData } from "../../../schemas/records.js";

const SetAddressResult = Schema.Struct({
  coinType: CoinType,
  address: Schema.String,
  raw: AddressRecordData,
});

const UnsetAddressResult = Schema.Struct({
  coinType: CoinType,
  address: Schema.Null,
  raw: Schema.Null,
});

export const AddressResult = Schema.Union([SetAddressResult, UnsetAddressResult]);

export type AddressResult = typeof AddressResult.Type;

export type GetAddressParameters = {
  readonly name: string;
  readonly coinType?: bigint;
} & BlockParameters;

export type GetAddressesParameters = {
  readonly name: string;
  readonly coinTypes: ReadonlyArray<bigint>;
} & BlockParameters;

export type GetAddressError = CodecError | ContractError | NameError | RpcError;

export type GetAddressesError = GetAddressError;
