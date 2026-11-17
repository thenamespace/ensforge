import { Effect } from "effect";

import {
  getExpiryV2EthRegistryAbi,
  getExpiryV2GracePeriodAbi,
  getExpiryV2TemporalRegistryAbi,
  getExpiryV2UniversalResolverAbi,
} from "@ensforge/contracts/internal";
import { isAddressEqual, zeroAddress } from "viem";

import type { EnsV2ConfigDeployment } from "../../../config/custom-network.js";
import type { CodecError } from "../../../errors/codec-error.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import type { ViemError } from "../../../internal/errors/viem-error.js";
import type { ReadContext } from "../../../internal/read/execution-context.js";
import { analyzeName } from "../../../names/analyze.js";
import { dnsEncodeName } from "../../../names/dns.js";
import { labelhash } from "../../../names/hashes.js";
import type { NormalizedName } from "../../../schemas/name.js";
import type { ExpiryResult } from "./types.js";

export const getExpiryV2 = Effect.fn("getExpiryV2")(function* (
  name: NormalizedName,
  deployment: EnsV2ConfigDeployment,
): Effect.fn.Return<ExpiryResult | null, CodecError | ViemError, EthereumClient | ReadContext> {
  const ethereum = yield* EthereumClient;
  const analysis = analyzeName(name);

  if (analysis.isSecondLevelEth && analysis.label !== undefined) {
    const [state, gracePeriod] = yield* Effect.all(
      [
        ethereum.readContract({
          address: deployment.contracts.ethRegistry,
          abi: getExpiryV2EthRegistryAbi,
          functionName: "getState",
          args: [BigInt(labelhash(analysis.label))],
        }),
        ethereum.readContract({
          address: deployment.contracts.ethRegistrar,
          abi: getExpiryV2GracePeriodAbi,
          functionName: "GRACE_PERIOD",
        }),
      ] as const,
      { concurrency: "unbounded" },
    );

    return state.expiry === 0n
      ? null
      : {
          name,
          expiry: state.expiry,
          gracePeriod,
          gracePeriodEnd: state.expiry + gracePeriod,
          protocol: "v2",
          source: "registry",
        };
  }

  if (analysis.label === undefined) return null;

  const dnsName = yield* dnsEncodeName.effect(name);

  const parentRegistry = yield* ethereum.readContract({
    address: deployment.contracts.universalHelper,
    abi: getExpiryV2UniversalResolverAbi,
    functionName: "findParentRegistry",
    args: [dnsName],
  });

  if (isAddressEqual(parentRegistry, zeroAddress)) return null;

  const expiry = yield* ethereum.readContract({
    address: parentRegistry,
    abi: getExpiryV2TemporalRegistryAbi,
    functionName: "findExpiry",
    args: [analysis.label],
  });

  return expiry === 0n
    ? null
    : {
        name,
        expiry,
        gracePeriod: 0n,
        gracePeriodEnd: expiry,
        protocol: "v2",
        source: "registry",
      };
});
