import { Effect } from "effect";

import { isAddressEqual, type Address, type Hex } from "viem";

import type { HcaManagementResult } from "../../actions/hca/management-types.js";
import type { EnsforgeConfig } from "../../config/config.js";
import { HcaError } from "../../errors/hca-error.js";
import type { WalletOverrides, ConfirmationPolicy, WriteError } from "../../write/types.js";
import { provideConfig } from "../config/context.js";
import { resolveWalletContext } from "../services/wallet-client.js";
import { WriteClient } from "../write/write-client.js";
import { hcaRpc } from "./context.js";

/** Management uses the actual wallet caller; it never falls back to an execution adapter. */
export const submitHcaManagement = Effect.fn("submitHcaManagement")(function* (
  config: EnsforgeConfig,
  parameters: WalletOverrides & { readonly confirmation?: ConfirmationPolicy },
  call: {
    readonly operation: string;
    readonly to: Address;
    readonly data: Hex;
    readonly value: bigint;
    readonly owner?: Address;
  },
): Effect.fn.Return<HcaManagementResult, WriteError> {
  const { walletClient, account } = yield* provideConfig(config, resolveWalletContext(parameters));
  const caller = typeof account === "string" ? account : account.address;

  if (call.owner !== undefined && !isAddressEqual(caller, call.owner))
    return yield* new HcaError({
      code: "OWNER_MISMATCH",
      message: "This management action requires its owner as the direct wallet caller",
    });

  if ((yield* hcaRpc(() => walletClient.getChainId())) !== config.chainId)
    return yield* new HcaError({
      code: "DEPLOYMENT_MISMATCH",
      message: "Connected wallet changed networks",
    });

  const client = yield* provideConfig(config, WriteClient);
  const transaction = {
    id: call.operation,
    operation: call.operation,
    account,
    chainId: config.chainId,
    to: call.to,
    data: call.data,
    value: call.value,
  };
  yield* client.simulate(transaction);

  const hash = yield* client.sendTransaction(walletClient, transaction);
  const confirmation = parameters.confirmation ?? config.writes.confirmation;

  if (confirmation.type === "submitted") return { hash, receipt: null };

  const receipt = yield* client.waitForReceipt(hash, {
    ...(confirmation.confirmations === undefined
      ? {}
      : { confirmations: confirmation.confirmations }),
    ...(confirmation.timeout === undefined ? {} : { timeout: confirmation.timeout }),
  });

  return { hash, receipt };
});
