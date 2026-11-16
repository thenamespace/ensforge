import type { Account, Address, WalletClient } from "viem";

import type { EthereumAddress } from "../../../schemas/identity.js";
import type { ConfirmationPolicy, WriteError } from "../../../write/types.js";
import type { CreateResolverResult } from "../create-resolver/types.js";

export interface GetOrCreateResolverParameters {
  readonly name: string;
  readonly salt?: bigint;
  readonly admin?: string;
  readonly roles?: bigint;
  readonly walletClient?: WalletClient;
  readonly account?: Account | Address;
  readonly confirmation?: ConfirmationPolicy;
}

export type GetOrCreateResolverResult =
  | {
      readonly status: "existing";
      readonly protocol: "v1" | "v2";
      readonly resolver: EthereumAddress;
      readonly inherited: false;
    }
  | {
      readonly status: "selected";
      readonly protocol: "v1";
      readonly resolver: EthereumAddress;
      readonly inherited: false;
    }
  | (CreateResolverResult & { readonly protocol: "v2"; readonly inherited: false });

export type GetOrCreateResolverError = WriteError;
