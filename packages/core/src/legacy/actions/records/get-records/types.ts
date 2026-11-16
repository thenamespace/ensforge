import type { Effect } from "effect";

import type { AssetGatewayUrls } from "viem";

import type { BlockParameters } from "../../../action/block.js";
import type { EnsReadAction, EnsReadRequest } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import type { CodecError } from "../../../errors/codec-error.js";
import type { ContractError } from "../../../errors/contract-error.js";
import type { GatewayError } from "../../../errors/gateway-error.js";
import type { NameError } from "../../../errors/name-error.js";
import type { RpcError } from "../../../errors/rpc-error.js";
import type { NormalizedName } from "../../../schemas/name.js";
import type { AbiContentType } from "../../../schemas/records.js";
import type { AbiResult } from "../get-abi/types.js";
import type { AddressResult } from "../get-address/types.js";
import type { AvatarResult } from "../get-avatar/types.js";
import type { ContentHashResult } from "../get-content-hash/types.js";
import type { DataResult } from "../get-data/types.js";
import type { InterfaceResult } from "../get-interface/types.js";
import type { NameResult } from "../get-name/types.js";
import type { PubkeyResult } from "../get-pubkey/types.js";
import type { TextResult } from "../get-text/types.js";

export type GetRecordsSelection = {
  readonly addresses?: ReadonlyArray<bigint>;
  readonly texts?: ReadonlyArray<string>;
  readonly avatar?: boolean;
  readonly contentHash?: boolean;
  readonly abi?: boolean | { readonly contentTypes?: ReadonlyArray<AbiContentType> };
  readonly pubkey?: boolean;
  readonly name?: boolean;
  readonly interfaces?: ReadonlyArray<string>;
  readonly data?: ReadonlyArray<string>;
};

export type GetRecordsParameters<Selection extends GetRecordsSelection = GetRecordsSelection> = {
  readonly name: string;
  readonly records: Selection;
  readonly gatewayUrls?: AssetGatewayUrls;
} & BlockParameters;

type Selected<
  Selection,
  Key extends PropertyKey,
  ResultKey extends PropertyKey,
  Result,
> = GetRecordsSelection extends Selection
  ? { readonly [Property in ResultKey]?: Result }
  : Key extends keyof Selection
    ? Exclude<Selection[Key], false | undefined> extends never
      ? {}
      : { readonly [Property in ResultKey]: Result }
    : {};

export type GetRecordsResult<Selection extends GetRecordsSelection = GetRecordsSelection> = {
  readonly name: NormalizedName;
} & Selected<Selection, "addresses", "addresses", ReadonlyArray<AddressResult>> &
  Selected<Selection, "texts", "texts", ReadonlyArray<TextResult>> &
  Selected<Selection, "avatar", "avatar", AvatarResult> &
  Selected<Selection, "contentHash", "contentHash", ContentHashResult> &
  Selected<Selection, "abi", "abi", AbiResult> &
  Selected<Selection, "pubkey", "pubkey", PubkeyResult> &
  Selected<Selection, "name", "nameRecord", NameResult> &
  Selected<Selection, "interfaces", "interfaces", ReadonlyArray<InterfaceResult>> &
  Selected<Selection, "data", "data", ReadonlyArray<DataResult>>;

export type GetRecordsError = CodecError | ContractError | GatewayError | NameError | RpcError;

type GetRecordsEffect = <const Selection extends GetRecordsSelection>(
  config: EnsforgeConfig,
  parameters: GetRecordsParameters<Selection>,
) => Effect.Effect<GetRecordsResult<Selection>, GetRecordsError>;

export interface GetRecordsAction extends Omit<
  EnsReadAction<GetRecordsParameters, GetRecordsResult, GetRecordsError>,
  "effect" | "request"
> {
  <const Selection extends GetRecordsSelection>(
    config: EnsforgeConfig,
    parameters: GetRecordsParameters<Selection>,
    options?: Effect.RunOptions,
  ): Promise<GetRecordsResult<Selection>>;

  readonly effect: GetRecordsEffect;
  readonly request: <const Selection extends GetRecordsSelection>(
    parameters: GetRecordsParameters<Selection>,
  ) => EnsReadRequest<GetRecordsResult<Selection>, GetRecordsError>;
}
