import { Effect } from "effect";

import { nameWrapperV1GetDataAbi } from "@ensforge/contracts/internal";
import { isAddressEqual, zeroAddress } from "viem";

import type { BlockParameters } from "../../action/block.js";
import type { EnsforgeConfig } from "../../config/config.js";
import type { EnsV1ConfigDeployment } from "../../config/custom-network.js";
import { AuthorizationError } from "../../errors/authorization-error.js";
import { EthereumClient } from "../../internal/client/ethereum-client.js";
import { readNameRoute } from "../../internal/name/name-route.js";
import { executeRead } from "../../internal/read/execute-read.js";
import { analyzeName, type NameAnalysis } from "../../names/analyze.js";
import { namehash } from "../../names/hashes.js";
import { normalizeName } from "../../names/normalize.js";
import type { NormalizedName } from "../../schemas/name.js";

export interface V1WrapperRoute {
  readonly supported: true;
  readonly protocol: "v1";
  readonly name: NormalizedName;
  readonly analysis: NameAnalysis;
  readonly deployment: EnsV1ConfigDeployment;
  readonly node: `0x${string}`;
  readonly wrapped: boolean;
  readonly owner: `0x${string}` | null;
  readonly fuses: number;
  readonly expiry: bigint;
}

export interface V2WrapperRoute {
  readonly supported: false;
  readonly protocol: "v2";
  readonly name: NormalizedName;
}

export type WrapperRoute = V1WrapperRoute | V2WrapperRoute;

export const resolveWrapperRoute = Effect.fn("ensforge.resolveWrapperRoute")(function* (
  config: EnsforgeConfig,
  inputName: string,
  block: BlockParameters = {},
) {
  const name = yield* normalizeName.effect(inputName);

  return yield* executeRead(
    config,
    block,
    Effect.gen(function* () {
      const route = yield* readNameRoute(name);

      if (route.kind !== "v1" && route.kind !== "reserved") {
        return { supported: false, protocol: "v2", name } as const;
      }

      const deployment = route.kind === "reserved" ? route.v1 : route.deployment;
      const node = namehash(name);
      const ethereum = yield* EthereumClient;

      const [owner, fuses, expiry] = yield* ethereum.readContract({
        address: deployment.contracts.nameWrapper,
        abi: nameWrapperV1GetDataAbi,
        functionName: "getData",
        args: [BigInt(node)],
      });

      return {
        supported: true,
        protocol: "v1",
        name,
        analysis: analyzeName(name),
        deployment,
        node,
        wrapped: !isAddressEqual(owner, zeroAddress),
        owner: isAddressEqual(owner, zeroAddress) ? null : owner,
        fuses,
        expiry,
      } as const;
    }),
  );
});

export const requireV1WrapperRoute = Effect.fn("ensforge.requireV1WrapperRoute")(function* (
  config: EnsforgeConfig,
  name: string,
) {
  const route = yield* resolveWrapperRoute(config, name);

  if (!route.supported) {
    return yield* new AuthorizationError({
      code: "WRITE_TARGET_UNAVAILABLE",
      message: `ENSv1 Name Wrapper operations are unavailable for ${route.name}`,
    });
  }

  return route;
});

export const requireWrappedRoute = Effect.fn("ensforge.requireWrappedRoute")(function* (
  config: EnsforgeConfig,
  name: string,
) {
  const route = yield* requireV1WrapperRoute(config, name);

  if (!route.wrapped) {
    return yield* new AuthorizationError({
      code: "WRITE_TARGET_UNAVAILABLE",
      message: `${route.name} is not wrapped`,
    });
  }

  return route;
});
