import { Effect } from "effect";

import type { Account, Address } from "viem";
import { getChainId } from "viem/actions";

import { stateOf } from "../../client/state.js";
import type { Client, ViemWalletClient } from "../../client/types.js";
import { ConfigError } from "../../errors/classes/ConfigError.js";
import { WalletError } from "../../errors/classes/WalletError.js";
import type { AnyError } from "../../errors/types.js";
import { fromPromise } from "../rpc/fromPromise.js";

/** A wallet client and the account it signs with, checked against the client's chain. */
export type Signer = {
  readonly walletClient: ViemWalletClient;
  readonly account: Account | Address;
};

/** Resolves the wallet for a write: the per-call `account`, then the client's, then the wallet's. */
export const resolveSigner = Effect.fnUntraced(function* (
  client: Client,
  account: Account | Address | undefined,
): Effect.fn.Return<Signer, AnyError> {
  const state = stateOf(client);
  const walletClient =
    state === undefined ? undefined : yield* fromPromise(() => state.getWalletClient());
  if (walletClient === undefined)
    return yield* Effect.fail(new ConfigError({ code: "WALLET_NOT_CONFIGURED" }));

  const signer = account ?? state?.signer ?? walletClient.account;
  if (signer === undefined)
    return yield* Effect.fail(new WalletError({ code: "ACCOUNT_NOT_FOUND" }));

  const actualChainId =
    walletClient.chain?.id ?? (yield* fromPromise(() => getChainId(walletClient)));
  if (actualChainId !== client.chain.id) {
    return yield* Effect.fail(
      new WalletError({ code: "CHAIN_MISMATCH", expectedChainId: client.chain.id, actualChainId }),
    );
  }

  return { walletClient, account: signer };
});

/** Address of an account option. */
export const addressOf = (account: Account | Address | undefined): Address | undefined =>
  typeof account === "object" ? account.address : account;
