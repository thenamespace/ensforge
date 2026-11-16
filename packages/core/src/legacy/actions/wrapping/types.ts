import type { Account, Address, WalletClient } from "viem";

import type { BlockParameters } from "../../action/block.js";
import type { EnsWriteIntent } from "../../action/write-intent.js";
import type { EthereumAddress } from "../../schemas/identity.js";
import type { WorkflowParameters, WorkflowProgress } from "../../workflows/types.js";
import type {
  CallExecutionResult,
  ConfirmationPolicy,
  WriteError,
  WriteMode,
  WritePlanProgress,
} from "../../write/types.js";
import type { NameState } from "../name/get-name-state/types.js";
import type { GetNameStateError } from "../name/get-name-state/types.js";
import type { NameWrapperFuseName } from "./fuse-mask.js";

export type WrapperReadParameters = { readonly name: string } & BlockParameters;

export type WrapperUnsupportedReason = "FUSES_NOT_SUPPORTED" | "WRAPPER_EXPIRY_NOT_SUPPORTED";

export type GetFusesResult =
  | {
      readonly protocol: "v1";
      readonly supported: true;
      readonly wrapped: boolean;
      readonly value: number;
      readonly active: ReadonlyArray<NameWrapperFuseName>;
      readonly ownerControlled: number;
      readonly parentControlled: number;
    }
  | {
      readonly protocol: "v2";
      readonly supported: false;
      readonly reason: "FUSES_NOT_SUPPORTED";
    };

export type GetWrapperExpiryResult =
  | {
      readonly protocol: "v1";
      readonly supported: true;
      readonly wrapped: boolean;
      readonly expiry: bigint | null;
    }
  | {
      readonly protocol: "v2";
      readonly supported: false;
      readonly reason: "WRAPPER_EXPIRY_NOT_SUPPORTED";
    };

interface WalletWriteParameters {
  readonly walletClient?: WalletClient;
  readonly account?: Account | Address;
}

export interface WrapNameParameters extends WorkflowParameters, WalletWriteParameters {
  readonly name: string;
  readonly owner: string;
  readonly resolver?: string;
  readonly fuses?: number | ReadonlyArray<NameWrapperFuseName>;
  readonly mode?: WriteMode;
  readonly confirmation?: ConfirmationPolicy;
  readonly resume?: WrapNameResult;
}

export interface WrapNameResult extends WorkflowProgress {
  readonly name: string;
  readonly protocol: "v1";
  readonly strategy: "eth-2ld" | "registry";
  readonly owner: EthereumAddress;
  readonly approvals: {
    readonly registrar: boolean;
    readonly registry: boolean;
  };
  readonly write: WritePlanProgress;
  readonly finalState: NameState | null;
}

export interface UnwrapNameParameters {
  readonly name: string;
  readonly manager: string;
  readonly registrant?: string;
}

export interface SetFusesParameters {
  readonly name: string;
  readonly fuses: number | ReadonlyArray<NameWrapperFuseName>;
}

export interface SetChildFusesParameters extends SetFusesParameters {
  readonly expiry: bigint;
}

export interface ExtendSubnameExpiryParameters {
  readonly name: string;
  readonly expiry: bigint;
}

export type WrapperReadError = GetNameStateError;

export type WrapperWriteError = WriteError;

export type WrapperWriteResult = CallExecutionResult;

export type WrapperWriteIntent = EnsWriteIntent<WrapperWriteResult, WrapperWriteError>;
