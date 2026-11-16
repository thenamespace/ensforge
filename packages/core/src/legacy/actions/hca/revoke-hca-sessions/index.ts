import { Effect } from "effect";

import { standaloneHcaV2RevokeSessionsAbi } from "@ensforge/contracts/internal";
import {
  encodeFunctionData,
  isAddressEqual,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";

import { defineAction } from "../../../action/action.js";
import { HcaError } from "../../../errors/hca-error.js";
import { provideConfig } from "../../../internal/config/context.js";
import { hcaRpc } from "../../../internal/hca/context.js";
import { resolveWalletContext } from "../../../internal/services/wallet-client.js";
import { WriteClient } from "../../../internal/write/write-client.js";
import type { ConfirmationPolicy, WalletOverrides, WriteError } from "../../../write/types.js";
import { getHcaSessionNonce } from "../get-hca-session-nonce/index.js";
import { verifyHca } from "../verify-hca/index.js";

export interface RevokeHcaSessionsParameters extends WalletOverrides {
  readonly hca: Address;
  readonly salt?: bigint;
  readonly confirmation?: ConfirmationPolicy;
}

export interface RevokeHcaSessionsResult {
  readonly hash: Hex;
  readonly receipt: TransactionReceipt | null;
  readonly sessionNonce: bigint | null;
}

export const revokeHcaSessions = defineAction<
  RevokeHcaSessionsParameters,
  RevokeHcaSessionsResult,
  WriteError
>(
  Effect.fn("ensforge.revokeHcaSessions")(function* (config, parameters) {
    const hca = yield* verifyHca.effect(config, parameters);

    const { walletClient, account } = yield* provideConfig(
      config,
      resolveWalletContext(parameters),
    );

    const owner = typeof account === "string" ? account : account.address;

    if (!isAddressEqual(owner, hca.owner))
      return yield* new HcaError({
        code: "OWNER_MISMATCH",
        message: "Session revocation requires the immutable owner directly",
      });

    if ((yield* hcaRpc(() => walletClient.getChainId())) !== config.chainId)
      return yield* new HcaError({
        code: "DEPLOYMENT_MISMATCH",
        message: "The connected wallet changed networks",
      });

    const client = yield* provideConfig(config, WriteClient);

    const call = {
      id: "hca-revoke",
      operation: "revokeHcaSessions",
      account,
      chainId: config.chainId,
      to: hca.address,
      value: 0n,
      data: encodeFunctionData({
        abi: standaloneHcaV2RevokeSessionsAbi,
        functionName: "revokeSessions",
      }),
    };

    yield* client.simulate(call);

    const hash = yield* client.sendTransaction(walletClient, call);
    const confirmation = parameters.confirmation ?? config.writes.confirmation;

    if (confirmation.type === "submitted") return { hash, receipt: null, sessionNonce: null };

    const receipt = yield* client.waitForReceipt(hash, {
      ...(confirmation.confirmations === undefined
        ? {}
        : { confirmations: confirmation.confirmations }),
      ...(confirmation.timeout === undefined ? {} : { timeout: confirmation.timeout }),
    });

    const sessionNonce = yield* getHcaSessionNonce.effect(config, {
      hca: hca.address,
      blockNumber: receipt.blockNumber,
    });

    return { hash, receipt, sessionNonce };
  }),
);
