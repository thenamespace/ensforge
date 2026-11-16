import { Context, Effect, Option } from "effect";

import type { Account, Address, WalletClient } from "viem";

import { ConfigError } from "../../errors/config-error.js";
import { EnsNetworkService } from "./network.js";

export class WalletClientService extends Context.Service<
  WalletClientService,
  {
    readonly client: Option.Option<WalletClient>;
    readonly resolve: () => Effect.Effect<WalletClient, ConfigError>;
  }
>()("@ensforge/core/WalletClientService") {}

export type WalletClientResolver = () => Effect.Effect<WalletClient, ConfigError>;

export const makeWalletClientService = (
  walletClient?: WalletClient,
  resolver?: WalletClientResolver,
): WalletClientService["Service"] => {
  const client = Option.fromNullishOr(walletClient);

  return WalletClientService.of({
    client,
    resolve:
      resolver ??
      (() =>
        Option.match(client, {
          onNone: () =>
            new ConfigError({
              code: "WALLET_CLIENT_UNAVAILABLE",
              message: "A wallet client is required for this operation",
            }),
          onSome: Effect.succeed,
        })),
  });
};

export interface ResolveWalletContextParameters {
  readonly walletClient?: WalletClient;
  readonly account?: Account | Address;
}

export interface ResolvedWalletContext {
  readonly walletClient: WalletClient;
  readonly account: Account | Address;
}

export const resolveWalletContext = Effect.fn("ensforge.resolveWalletContext")(function* (
  parameters: ResolveWalletContextParameters = {},
): Effect.fn.Return<ResolvedWalletContext, ConfigError, WalletClientService | EnsNetworkService> {
  const walletService = yield* WalletClientService;
  const networkService = yield* EnsNetworkService;

  const walletClient =
    parameters.walletClient === undefined
      ? yield* walletService.resolve()
      : parameters.walletClient;

  if (walletClient.chain === undefined) {
    return yield* new ConfigError({
      code: "CLIENT_CHAIN_UNAVAILABLE",
      message: "The wallet client must be configured with a chain",
    });
  }

  if (walletClient.chain.id !== networkService.chainId) {
    return yield* new ConfigError({
      code: "NETWORK_CLIENT_MISMATCH",
      message: `The wallet client chain ${walletClient.chain.id} does not match ${networkService.network} (${networkService.chainId})`,
    });
  }

  const account = parameters.account ?? walletClient.account;

  if (account === undefined) {
    return yield* new ConfigError({
      code: "WALLET_ACCOUNT_UNAVAILABLE",
      message: "An account is required for this operation",
    });
  }

  return { walletClient, account };
});
