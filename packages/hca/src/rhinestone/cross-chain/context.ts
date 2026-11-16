import { HcaError, type EnsforgeConfig } from "@ensforge/core/legacy";
import {
  getPermit2Address,
  type PreparedTransactionData,
  type RhinestoneAccount,
  type RhinestoneSDK,
} from "@rhinestone/sdk";
import { keccak256, stringToHex, type Hex } from "viem";

import type { RhinestoneOptions } from "../types.js";
import { restoreRhinestoneFunding, serializeRhinestoneFunding, fundingStorage } from "./storage.js";
import type {
  RhinestoneFundingQuote,
  RhinestoneFundingReference,
  RhinestoneFundingRoute,
  RhinestoneFundingSource,
} from "./types.js";

export interface FundingContext {
  readonly options: RhinestoneOptions;
  readonly sdk: RhinestoneSDK;
  readonly fingerprint: Hex;
  readonly quotes: WeakMap<
    RhinestoneFundingQuote,
    {
      readonly source: RhinestoneFundingSource;
      readonly account: RhinestoneAccount;
      readonly prepared: PreparedTransactionData;
      used: boolean;
    }
  >;
}

export const fundingFingerprint = (options: RhinestoneOptions) =>
  keccak256(
    stringToHex(
      JSON.stringify({
        chainId: options.chain.id,
        profile: options.profile.contracts,
        owner: options.owner.address,
        endpoint:
          options.sdk.endpointUrl === undefined
            ? "default"
            : new URL(options.sdk.endpointUrl).origin,
        funding: options.crossChain
          ? {
              routes: options.crossChain.routes,
              confirmations: options.crossChain.confirmations ?? 1,
              maximumQuoteLifetimeSeconds: options.crossChain.maximumQuoteLifetimeSeconds ?? 600,
            }
          : null,
      }),
    ),
  );

export const getFundingRoute = (context: FundingContext, id: string): RhinestoneFundingRoute => {
  const route = context.options.crossChain?.routes.find((entry) => entry.id === id);

  if (!route)
    throw new HcaError({
      code: "UNSUPPORTED_DEPLOYMENT",
      message: "No independently reviewed funding manifest for this route",
    });

  return route;
};

export const verifyFundingContracts = async (
  context: FundingContext,
  config: EnsforgeConfig,
  route: RhinestoneFundingRoute,
  source: RhinestoneFundingSource,
) => {
  if (
    config.chainId !== route.destinationChainId ||
    config.chainId !== context.options.chain.id ||
    source.chain.id !== route.sourceChainId ||
    source.chain.id === config.chainId ||
    (await source.publicClient.getChainId()) !== source.chain.id ||
    (await config.publicClient.getChainId()) !== config.chainId
  )
    throw new HcaError({
      code: "DEPLOYMENT_MISMATCH",
      message: "Funding RPC chains do not match the manifest",
    });

  const code = await source.publicClient.getCode({ address: source.account.address });

  if (code && code !== "0x")
    throw new HcaError({
      code: "UNSUPPORTED_AUTHORIZATION",
      message: "Funding requires an undelegated EOA source account",
    });

  await Promise.all(
    (
      [
        [
          source.publicClient,
          route.sourceContracts,
          [getPermit2Address(), route.arbiter, route.sourceToken],
        ],
        [
          config.publicClient,
          route.destinationContracts,
          [route.destinationToken, route.destinationSettlement],
        ],
      ] as const
    ).map(async ([client, pins, required]) => {
      if (
        !pins.length ||
        required.some(
          (address) => !pins.some((pin) => pin.address.toLowerCase() === address.toLowerCase()),
        )
      )
        throw new HcaError({
          code: "UNSUPPORTED_DEPLOYMENT",
          message: "Manifest must pin Permit2, arbiter, token and settlement infrastructure",
        });

      await Promise.all(
        pins.map(async (pin) => {
          const bytecode = await client.getCode({ address: pin.address });

          if (
            !bytecode ||
            bytecode === "0x" ||
            keccak256(bytecode).toLowerCase() !== pin.codeHash.toLowerCase()
          )
            throw new HcaError({
              code: "DEPLOYMENT_MISMATCH",
              message: `Funding contract differs from manifest: ${pin.address}`,
            });

          await Promise.all(
            (pin.storageSlots ?? []).map(async ({ slot, value }) => {
              const stored = await client.getStorageAt({ address: pin.address, slot });

              if (stored?.toLowerCase() !== value.toLowerCase())
                throw new HcaError({
                  code: "DEPLOYMENT_MISMATCH",
                  message: `Funding contract storage differs from manifest: ${pin.address}`,
                });
            }),
          );
        }),
      );
    }),
  );
};

export const loadFunding = async (
  context: FundingContext,
  config: EnsforgeConfig,
  input: RhinestoneFundingReference,
) => {
  const saved = await fundingStorage(input.storage ?? config.storage).get(input.id);

  if (!saved)
    throw new HcaError({ code: "INVALID_PARAMETERS", message: "Funding operation does not exist" });

  const record = restoreRhinestoneFunding(serializeRhinestoneFunding(saved));
  const route = getFundingRoute(context, record.routeId);

  if (
    record.id !== input.id ||
    record.configurationFingerprint !== context.fingerprint ||
    record.destinationChainId !== config.chainId ||
    route.sourceChainId !== record.sourceChainId ||
    route.destinationChainId !== record.destinationChainId ||
    route.sourceToken.toLowerCase() !== record.sourceToken.toLowerCase() ||
    route.destinationToken.toLowerCase() !== record.destinationToken.toLowerCase()
  )
    throw new HcaError({
      code: "ADAPTER_MISMATCH",
      message: "Saved funding belongs to another adapter or route",
    });

  return record;
};
