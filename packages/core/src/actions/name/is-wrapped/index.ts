import { Effect } from "effect";

import {
  nameWrapperV1IsWrappedAbi,
  permissionedRegistryV2InterfaceGetSubregistryAbi,
} from "@ensforge/contracts/internal";
import { erc165Abi } from "@ensforge/contracts/shared";
import { registryInterfaceIds } from "@ensforge/contracts/v2";
import { isAddressEqual, zeroAddress } from "viem";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { readNameRoute } from "../../../internal/name/name-route.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { namehash } from "../../../names/hashes.js";
import { normalizeName } from "../../../names/normalize.js";
import type { GetNameStateError, GetNameStateParameters } from "../get-name-state/types.js";

const isWrappedEffect = Effect.fn("ensforge.isWrapped")(function* (
  config: EnsforgeConfig,
  parameters: GetNameStateParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const route = yield* readNameRoute(name);
      const ethereum = yield* EthereumClient;

      if (route.kind === "v1" || route.kind === "reserved") {
        const deployment = route.kind === "reserved" ? route.v1 : route.deployment;

        return yield* ethereum.readContract({
          address: deployment.contracts.nameWrapper,
          abi: nameWrapperV1IsWrappedAbi,
          functionName: "isWrapped",
          args: [namehash(name)],
        });
      }

      if (route.kind === "available") return false;

      const subregistry = yield* ethereum.readContract({
        address: route.parentRegistry,
        abi: permissionedRegistryV2InterfaceGetSubregistryAbi,
        functionName: "getSubregistry",
        args: [route.label],
      });

      const registries = [route.parentRegistry, subregistry].filter(
        (address) => !isAddressEqual(address, zeroAddress),
      );

      const support = yield* Effect.all(
        registries.map((address) =>
          ethereum.readContract({
            address,
            abi: erc165Abi,
            functionName: "supportsInterface",
            args: [registryInterfaceIds.wrapperRegistry],
          }),
        ),
        { concurrency: "unbounded" },
      );

      return support.some(Boolean);
    }),
  );
});

export const isWrapped = defineReadAction<GetNameStateParameters, boolean, GetNameStateError>(
  isWrappedEffect,
);

export type {
  GetNameStateError as IsWrappedError,
  GetNameStateParameters as IsWrappedParameters,
} from "../get-name-state/types.js";
