import type { Account, Address, WalletClient } from "viem";

import type { EthereumAddress } from "../../../schemas/identity.js";
import type {
  ConfirmationPolicy,
  SendCallsResult,
  WriteAtomicity,
  WriteError,
  WriteMode,
} from "../../../write/types.js";
import type { RecordOperation } from "../../capabilities/types.js";

export interface SetRecordPermissionsParameters {
  readonly name: string;
  readonly account: string;
  readonly records: ReadonlyArray<RecordOperation>;
  readonly approved: boolean;
  readonly allowScopeWidening?: boolean;
  readonly walletClient?: WalletClient;
  readonly walletAccount?: Account | Address;
  readonly mode?: WriteMode;
  readonly atomicity?: WriteAtomicity;
  readonly confirmation?: ConfirmationPolicy;
  readonly capabilities?: Readonly<Record<string, unknown>>;
}

export interface AppliedRecordPermission {
  readonly record: RecordOperation;
  readonly resource: bigint;
  readonly roles: bigint;
}

export type SetRecordPermissionsResult =
  | {
      readonly model: "public-resolver-delegate";
      readonly protocol: "v1" | "v2";
      readonly resolver: EthereumAddress;
      readonly account: EthereumAddress;
      readonly approved: boolean;
      readonly scope: "node";
      readonly widened: true;
      readonly execution: SendCallsResult;
    }
  | {
      readonly model: "permissioned-resolver-roles";
      readonly protocol: "v2";
      readonly resolver: EthereumAddress;
      readonly account: EthereumAddress;
      readonly approved: boolean;
      readonly scope: "resolver";
      readonly widened: true;
      readonly permissions: ReadonlyArray<AppliedRecordPermission>;
      readonly execution: SendCallsResult;
    };

export type SetRecordPermissionsError = WriteError;
