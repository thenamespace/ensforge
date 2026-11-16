import { Effect } from "effect";

import {
  baseRegistrarV1GetApprovedAbi,
  nameWrapperV1GetApprovedAbi,
  nameWrapperV1IsWrappedAbi,
} from "@ensforge/contracts/internal";
import { isAddressEqual, zeroAddress } from "viem";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { readNameRoute } from "../../../internal/name/name-route.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { analyzeName } from "../../../names/analyze.js";
import { labelhash, namehash } from "../../../names/hashes.js";
import { normalizeName } from "../../../names/normalize.js";
import type { CapabilityError, NameCapabilityParameters, TokenApprovalResult } from "../types.js";

const getTokenApprovalEffect = Effect.fn("ensforge.getTokenApproval")(function* (
  config: EnsforgeConfig,
  parameters: NameCapabilityParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const route = yield* readNameRoute(name);

      if (route.kind !== "v1" && route.kind !== "reserved") {
        return {
          supported: false,
          protocol: "v2",
          reason: "PER_TOKEN_APPROVAL_UNSUPPORTED",
        } as const;
      }

      const deployment = route.kind === "reserved" ? route.v1 : route.deployment;
      const ethereum = yield* EthereumClient;
      const node = namehash(name);

      const wrapped = yield* ethereum.readContract({
        address: deployment.contracts.nameWrapper,
        abi: nameWrapperV1IsWrappedAbi,
        functionName: "isWrapped",
        args: [node],
      });

      if (wrapped) {
        const approved = yield* ethereum.readContract({
          address: deployment.contracts.nameWrapper,
          abi: nameWrapperV1GetApprovedAbi,
          functionName: "getApproved",
          args: [BigInt(node)],
        });

        return {
          supported: true,
          protocol: "v1",
          kind: "name-wrapper",
          contract: deployment.contracts.nameWrapper,
          tokenId: BigInt(node),
          approved: isAddressEqual(approved, zeroAddress) ? null : approved,
        } as const;
      }

      const analysis = analyzeName(name);

      if (!analysis.isSecondLevelEth || analysis.ethSecondLevelLabel === undefined) {
        return { supported: false, protocol: "v1", reason: "NAME_NOT_TOKENIZED" } as const;
      }

      const tokenId = BigInt(labelhash(analysis.ethSecondLevelLabel));

      const approved = yield* ethereum.readContract({
        address: deployment.contracts.baseRegistrar,
        abi: baseRegistrarV1GetApprovedAbi,
        functionName: "getApproved",
        args: [tokenId],
      });

      return {
        supported: true,
        protocol: "v1",
        kind: "registrar",
        contract: deployment.contracts.baseRegistrar,
        tokenId,
        approved: isAddressEqual(approved, zeroAddress) ? null : approved,
      } as const;
    }),
  );
});

export const getTokenApproval = defineReadAction<
  NameCapabilityParameters,
  TokenApprovalResult,
  CapabilityError
>(getTokenApprovalEffect);

export type {
  CapabilityError as GetTokenApprovalError,
  NameCapabilityParameters as GetTokenApprovalParameters,
  TokenApprovalResult,
} from "../types.js";
