import { Effect, Result, Schema } from "effect";

import { baseRegistrarV1OwnerOfAbi } from "@ensforge/contracts/internal";
import { isAddressEqual, zeroAddress } from "viem";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { ContractError } from "../../../errors/contract-error.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { readNameRoute } from "../../../internal/name/name-route.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { analyzeName } from "../../../names/analyze.js";
import { labelhash } from "../../../names/hashes.js";
import { normalizeName } from "../../../names/normalize.js";
import type { EthereumAddress } from "../../../schemas/identity.js";
import type { GetNameStateError, GetNameStateParameters } from "../get-name-state/types.js";

const getRegistrantEffect = Effect.fn("ensforge.getRegistrant")(function* (
  config: EnsforgeConfig,
  parameters: GetNameStateParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const route = yield* readNameRoute(name);

      if (route.kind === "v2" || route.kind === "available") return null;

      const analysis = analyzeName(name);

      if (!analysis.isSecondLevelEth || analysis.label === undefined) return null;

      const ethereum = yield* EthereumClient;
      const deployment = route.kind === "reserved" ? route.v1 : route.deployment;

      const result = yield* Effect.result(
        ethereum.readContract({
          address: deployment.contracts.baseRegistrar,
          abi: baseRegistrarV1OwnerOfAbi,
          functionName: "ownerOf",
          args: [BigInt(labelhash(analysis.label))],
        }),
      );

      if (Result.isFailure(result)) {
        return Schema.is(ContractError)(result.failure) && result.failure.code === "REVERTED"
          ? null
          : yield* result.failure;
      }

      return isAddressEqual(result.success, zeroAddress) ? null : result.success;
    }),
  );
});

export const getRegistrant = defineReadAction<
  GetNameStateParameters,
  EthereumAddress | null,
  GetNameStateError
>(getRegistrantEffect);

export type {
  GetNameStateError as GetRegistrantError,
  GetNameStateParameters as GetRegistrantParameters,
} from "../get-name-state/types.js";

export type GetRegistrantResult = EthereumAddress | null;
