import { Effect } from "effect";

import {
  universalResolverV1ReverseAbi,
  universalResolverV2ReverseAbi,
} from "@ensforge/contracts/internal";
import type { Address, Hex } from "viem";

import { EthereumClient } from "../client/ethereum-client.js";
import type { ViemError } from "../errors/viem-error.js";
import { ReadContext } from "../read/execution-context.js";
import { DeploymentService } from "../services/deployment.js";

export const reverseAddress = Effect.fn("reverseAddress")(function* (
  address: Hex,
  coinType: bigint,
): Effect.fn.Return<
  readonly [string, Address, Address],
  ViemError,
  DeploymentService | EthereumClient | ReadContext
> {
  const ethereum = yield* EthereumClient;
  const context = yield* ReadContext;
  const deployment = yield* DeploymentService;
  const protocol = deployment.profile.protocol;

  const universalResolver =
    protocol === "v1"
      ? deployment.profile.v1.contracts.universalResolver
      : deployment.profile.v2.contracts.universalResolver;

  if (protocol === "v1") {
    return yield* ethereum.readContractDirect({
      address: universalResolver,
      abi: universalResolverV1ReverseAbi,
      functionName: "reverse",
      args: [address, coinType],
      ...context.block,
    });
  }

  return yield* ethereum.readContractDirect({
    address: universalResolver,
    abi: universalResolverV2ReverseAbi,
    functionName: "reverse",
    args: [address, coinType],
    ...context.block,
  });
});
