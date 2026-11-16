import { Effect } from "effect";

import { getExpiryV1NameWrapperAbi, getExpiryV1RegistrarAbi } from "@ensforge/contracts/internal";

import type { EnsV1ConfigDeployment } from "../../../config/custom-network.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import type { ViemError } from "../../../internal/errors/viem-error.js";
import type { ReadContext } from "../../../internal/read/execution-context.js";
import { analyzeName } from "../../../names/analyze.js";
import { labelhash, namehash } from "../../../names/hashes.js";
import type { NormalizedName } from "../../../schemas/name.js";
import type { ExpiryResult } from "./types.js";

export const getExpiryV1 = Effect.fn("getExpiryV1")(function* (
  name: NormalizedName,
  deployment: EnsV1ConfigDeployment,
): Effect.fn.Return<ExpiryResult | null, ViemError, EthereumClient | ReadContext> {
  const ethereum = yield* EthereumClient;
  const analysis = analyzeName(name);

  if (analysis.isSecondLevelEth && analysis.label !== undefined) {
    const [expiry, gracePeriod] = yield* Effect.all(
      [
        ethereum.readContract({
          address: deployment.contracts.baseRegistrar,
          abi: getExpiryV1RegistrarAbi,
          functionName: "nameExpires",
          args: [BigInt(labelhash(analysis.label))],
        }),
        ethereum.readContract({
          address: deployment.contracts.baseRegistrar,
          abi: getExpiryV1RegistrarAbi,
          functionName: "GRACE_PERIOD",
        }),
      ] as const,
      { concurrency: "unbounded" },
    );

    return expiry === 0n
      ? null
      : {
          name,
          expiry,
          gracePeriod,
          gracePeriodEnd: expiry + gracePeriod,
          protocol: "v1",
          source: "baseRegistrar",
        };
  }

  const [, , expiry] = yield* ethereum.readContract({
    address: deployment.contracts.nameWrapper,
    abi: getExpiryV1NameWrapperAbi,
    functionName: "getData",
    args: [BigInt(namehash(name))],
  });

  return expiry === 0n
    ? null
    : {
        name,
        expiry,
        gracePeriod: 0n,
        gracePeriodEnd: expiry,
        protocol: "v1",
        source: "nameWrapper",
      };
});
