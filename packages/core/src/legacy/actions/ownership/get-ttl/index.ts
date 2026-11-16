import { Effect } from "effect";

import { ensRegistryV1TtlAbi } from "@ensforge/contracts/internal";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { readNameRoute } from "../../../internal/name/name-route.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { namehash } from "../../../names/hashes.js";
import { normalizeName } from "../../../names/normalize.js";
import type { GetNameStateError, GetNameStateParameters } from "../../name/get-name-state/types.js";
import type { TtlResult } from "../types.js";

const getTtlEffect = Effect.fn("ensforge.getTtl")(function* (
  config: EnsforgeConfig,
  parameters: GetNameStateParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const route = yield* readNameRoute(name);

      if (route.kind === "v2" || route.kind === "available") {
        return { supported: false, protocol: "v2", reason: "TTL_UNSUPPORTED" } as const;
      }

      const ethereum = yield* EthereumClient;
      const deployment = route.kind === "reserved" ? route.v1 : route.deployment;

      const ttl = yield* ethereum.readContract({
        address: deployment.contracts.registry,
        abi: ensRegistryV1TtlAbi,
        functionName: "ttl",
        args: [namehash(name)],
      });

      return { supported: true, protocol: "v1", ttl } as const;
    }),
  );
});

export const getTtl = defineReadAction<GetNameStateParameters, TtlResult, GetNameStateError>(
  getTtlEffect,
);

export type { GetNameStateError as GetTtlError, GetNameStateParameters as GetTtlParameters };
export type { TtlResult as GetTtlResult } from "../types.js";
