import type { Effect } from "effect";

import type { EnsWriteIntent } from "../../../action/write-intent.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import type { Abi, AbiContentType, ContentHashProtocol } from "../../../schemas/records.js";
import type {
  CallExecutionResult,
  ConfirmationPolicy,
  SendCallsResult,
  WalletOverrides,
  WriteAtomicity,
  WriteError,
  WriteMode,
} from "../../../write/types.js";

export type SetRecordInput =
  | { readonly type: "clear" }
  | { readonly type: "text"; readonly key: string; readonly value: string }
  | { readonly type: "address"; readonly coinType?: bigint; readonly address: string }
  | {
      readonly type: "contentHash";
      readonly protocol: ContentHashProtocol;
      readonly value: string;
    }
  | {
      readonly type: "abi";
      readonly contentType: Exclude<AbiContentType, "uri">;
      readonly value: Abi;
    }
  | { readonly type: "abi"; readonly contentType: "uri"; readonly value: string }
  | { readonly type: "pubkey"; readonly x: `0x${string}`; readonly y: `0x${string}` }
  | {
      readonly type: "interface";
      readonly interfaceId: string;
      readonly implementer: string;
    }
  | { readonly type: "data"; readonly key: string; readonly value: `0x${string}` }
  | { readonly type: "name"; readonly value: string };

export interface SetRecordsParameters extends WalletOverrides {
  readonly name: string;
  readonly records: ReadonlyArray<SetRecordInput>;
  readonly aggregation?: "auto" | "resolver" | "wallet";
  readonly mode?: WriteMode;
  readonly atomicity?: WriteAtomicity;
  readonly confirmation?: ConfirmationPolicy;
  readonly capabilities?: Readonly<Record<string, unknown>>;
}

export interface ResolverMulticallResult {
  readonly mode: "resolver";
  readonly atomic: true;
  readonly status: "submitted" | "confirmed";
  readonly call: CallExecutionResult;
}

export type SetRecordsResult = ResolverMulticallResult | SendCallsResult;

export type SetRecordsError = WriteError;

export interface SetRecordsAction {
  (config: EnsforgeConfig, parameters: SetRecordsParameters): Promise<SetRecordsResult>;

  readonly effect: (
    config: EnsforgeConfig,
    parameters: SetRecordsParameters,
  ) => Effect.Effect<SetRecordsResult, SetRecordsError>;
  readonly call: (
    parameters: SetRecordsParameters,
  ) => EnsWriteIntent<CallExecutionResult, SetRecordsError>;
}
