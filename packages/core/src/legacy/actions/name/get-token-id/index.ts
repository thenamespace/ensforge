import { Effect } from "effect";

import {
  baseRegistrarV1NameExpiresAbi,
  nameWrapperV1IsWrappedAbi,
} from "@ensforge/contracts/internal";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { readNameRoute } from "../../../internal/name/name-route.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { analyzeName } from "../../../names/analyze.js";
import { labelhash, namehash } from "../../../names/hashes.js";
import { normalizeName } from "../../../names/normalize.js";
import type { GetNameStateError, GetNameStateParameters } from "../get-name-state/types.js";

const getTokenIdEffect = Effect.fn("ensforge.getTokenId")(function* (
  config: EnsforgeConfig,
  parameters: GetNameStateParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const route = yield* readNameRoute(name);

      if (route.kind === "v2") return route.state.tokenId;

      if (route.kind === "available") return null;

      const ethereum = yield* EthereumClient;
      const deployment = route.kind === "reserved" ? route.v1 : route.deployment;
      const node = namehash(name);

      const wrapped = yield* ethereum.readContract({
        address: deployment.contracts.nameWrapper,
        abi: nameWrapperV1IsWrappedAbi,
        functionName: "isWrapped",
        args: [node],
      });

      if (wrapped) return BigInt(node);

      const analysis = analyzeName(name);

      if (!analysis.isSecondLevelEth || analysis.label === undefined) return null;

      const labelId = BigInt(labelhash(analysis.label));

      const expiry = yield* ethereum.readContract({
        address: deployment.contracts.baseRegistrar,
        abi: baseRegistrarV1NameExpiresAbi,
        functionName: "nameExpires",
        args: [labelId],
      });

      return expiry === 0n ? null : labelId;
    }),
  );
});

export const getTokenId = defineReadAction<
  GetNameStateParameters,
  bigint | null,
  GetNameStateError
>(getTokenIdEffect);

export type {
  GetNameStateError as GetTokenIdError,
  GetNameStateParameters as GetTokenIdParameters,
} from "../get-name-state/types.js";

export type GetTokenIdResult = bigint | null;
