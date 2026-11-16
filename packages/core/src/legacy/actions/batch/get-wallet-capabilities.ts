import { Effect, Predicate } from "effect";

import { defineAction } from "../../action/action.js";
import type { EnsforgeConfig } from "../../config/config.js";
import type { ConfigError } from "../../errors/config-error.js";
import { WalletError } from "../../errors/wallet-error.js";
import { provideConfig } from "../../internal/config/context.js";
import { isWalletCallBundleUnsupported } from "../../internal/errors/write-error.js";
import { resolveWalletContext } from "../../internal/services/wallet-client.js";
import { WriteClient } from "../../internal/write/write-client.js";
import type {
  GetWalletCapabilitiesParameters,
  WalletCapabilitiesResult,
} from "../../write/types.js";

const capabilityStatus = (
  capabilities: Readonly<Record<string, unknown>>,
): WalletCapabilitiesResult["atomicity"] => {
  const atomic = capabilities.atomic;

  if (!Predicate.isObject(atomic)) return "unavailable";

  const status = atomic.status;

  return status === "supported" || status === "ready" || status === "unsupported"
    ? status
    : "unavailable";
};

const supportsPaymaster = (capabilities: Readonly<Record<string, unknown>>): boolean => {
  const paymaster = capabilities.paymasterService;

  return Predicate.isObject(paymaster) && paymaster.supported === true;
};

export const validateRequestedCapabilities = (
  requested: Readonly<Record<string, unknown>> | undefined,
  available: WalletCapabilitiesResult,
): WalletError | undefined => {
  if (requested === undefined) return undefined;

  for (const key of Object.keys(requested)) {
    const capability = available.raw[key];

    if (capability === undefined) {
      return new WalletError({
        code: "CAPABILITY_UNAVAILABLE",
        message: `The wallet does not advertise the requested ${key} capability`,
        cause: { requested, available: available.raw },
      });
    }

    if (
      Predicate.isObject(capability) &&
      (capability.supported === false || capability.status === "unsupported")
    ) {
      return new WalletError({
        code: "CAPABILITY_UNAVAILABLE",
        message: `The wallet reports the requested ${key} capability as unsupported`,
        cause: { requested, available: available.raw },
      });
    }
  }

  return undefined;
};

const getWalletCapabilitiesEffect = Effect.fn("ensforge.getWalletCapabilities")(function* (
  config: EnsforgeConfig,
  parameters: GetWalletCapabilitiesParameters,
) {
  return yield* provideConfig(
    config,
    Effect.gen(function* () {
      const { walletClient, account } = yield* resolveWalletContext(parameters);
      const client = yield* WriteClient;

      const capabilities = yield* client
        .getCapabilities(walletClient, account, config.chainId)
        .pipe(
          Effect.catch((error) =>
            isWalletCallBundleUnsupported(error.cause)
              ? Effect.succeed<Readonly<Record<string, unknown>>>({})
              : Effect.fail(error),
          ),
        );

      const atomicity = capabilityStatus(capabilities);

      return {
        chainId: config.chainId,
        nativeCalls: atomicity !== "unavailable",
        atomicity,
        paymasterService: supportsPaymaster(capabilities),
        raw: capabilities,
      } satisfies WalletCapabilitiesResult;
    }),
  );
});

export const getWalletCapabilities = defineAction<
  GetWalletCapabilitiesParameters,
  WalletCapabilitiesResult,
  ConfigError | WalletError
>(getWalletCapabilitiesEffect);
