import { Effect } from "effect";

import {
  universalResolverV1ResolveAbi,
  universalResolverV1ResolveWithResolverAbi,
  universalResolverV2ResolveAbi,
  universalResolverV2ResolveWithResolverAbi,
} from "@ensforge/contracts/internal";
import type { Address, Hex } from "viem";

import { EthereumClient } from "../client/ethereum-client.js";
import type { ViemError } from "../errors/viem-error.js";
import { ReadContext } from "../read/execution-context.js";

export interface ResolveNameParameters {
  readonly universalResolver: Address;
  readonly protocol: "v1" | "v2";
  readonly name: Hex;
  readonly data: Hex;
}

export interface ResolveNameWithResolverParameters extends ResolveNameParameters {
  readonly resolver: Address;
  readonly gateways: ReadonlyArray<string>;
}

export const resolveName = Effect.fn("resolveName")(function* ({
  universalResolver,
  protocol,
  name,
  data,
}: ResolveNameParameters): Effect.fn.Return<
  readonly [Hex, Address],
  ViemError,
  EthereumClient | ReadContext
> {
  const ethereum = yield* EthereumClient;
  const context = yield* ReadContext;
  const block = context.block;

  if (protocol === "v1") {
    return yield* ethereum.readContractDirect({
      address: universalResolver,
      abi: universalResolverV1ResolveAbi,
      functionName: "resolve",
      args: [name, data],
      ...block,
    });
  }

  return yield* ethereum.readContractDirect({
    address: universalResolver,
    abi: universalResolverV2ResolveAbi,
    functionName: "resolve",
    args: [name, data],
    ...block,
  });
});

export const resolveNameWithResolver = Effect.fn("resolveNameWithResolver")(function* ({
  universalResolver,
  resolver,
  protocol,
  name,
  data,
  gateways,
}: ResolveNameWithResolverParameters): Effect.fn.Return<
  Hex,
  ViemError,
  EthereumClient | ReadContext
> {
  const ethereum = yield* EthereumClient;
  const context = yield* ReadContext;
  const block = context.block;

  const parameters = {
    address: universalResolver,
    functionName: "resolveWithResolver",
    args: [resolver, name, data, gateways],
    ...block,
  } as const;

  if (protocol === "v1") {
    return yield* ethereum.readContractDirect({
      ...parameters,
      abi: universalResolverV1ResolveWithResolverAbi,
    });
  }

  return yield* ethereum.readContractDirect({
    ...parameters,
    abi: universalResolverV2ResolveWithResolverAbi,
  });
});
