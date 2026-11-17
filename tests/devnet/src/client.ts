import {
  createTestClient,
  http,
  publicActions,
  walletActions,
  type Chain,
  type HttpTransport,
  type PublicActions,
  type TestClient,
  type WalletActions,
} from "viem";
import { foundry } from "viem/chains";

/**
 * A viem client for a devnet: anvil test actions (`snapshot`, `revert`, `increaseTime`, `mine`,
 * `setCode`, `impersonateAccount`, …) plus public and wallet actions. Wallet actions send from
 * anvil's unlocked accounts by address.
 */
export type DevnetClient = TestClient<"anvil", HttpTransport, Chain> &
  PublicActions<HttpTransport, Chain> &
  WalletActions<Chain>;

export const devnetClient = (rpcUrl: string, chain: Chain = foundry): DevnetClient =>
  createTestClient({ mode: "anvil", chain, transport: http(rpcUrl), pollingInterval: 10 })
    .extend(publicActions)
    .extend(walletActions);
