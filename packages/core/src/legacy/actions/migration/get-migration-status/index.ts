import { Effect } from "effect";

import {
  nameWrapperV1GetDataAbi,
  nameWrapperV1IsWrappedAbi,
  universalHelperV2FindExactRegistryAbi,
} from "@ensforge/contracts/internal";
import { nameWrapperFuses } from "@ensforge/contracts/v1";
import { isAddressEqual, zeroAddress } from "viem";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { DeploymentService } from "../../../internal/services/deployment.js";
import { analyzeName } from "../../../names/analyze.js";
import { dnsEncodeName } from "../../../names/dns.js";
import { namehash } from "../../../names/hashes.js";
import { normalizeName } from "../../../names/normalize.js";
import { getNameState } from "../../name/get-name-state/index.js";
import type { MigrationNameParameters, MigrationReadError, MigrationStatus } from "../types.js";

const getMigrationStatusEffect = Effect.fn("ensforge.getMigrationStatus")(function* (
  config: EnsforgeConfig,
  parameters: MigrationNameParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);
  const analysis = analyzeName(name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const { profile } = yield* DeploymentService;

      if (profile.protocol === "v1") {
        return { status: "unsupported", name, reason: "ENSV2_NOT_ACTIVE" } as const;
      }

      if (!analysis.isEth || analysis.depth < 2) {
        return { status: "unsupported", name, reason: "NOT_ETH_NAME" } as const;
      }

      const ethereum = yield* EthereumClient;
      const v1 = profile.v1;

      if (v1 !== undefined && analysis.parent !== undefined && analysis.depth > 2) {
        const wrapped = yield* ethereum.readContract({
          address: v1.contracts.nameWrapper,
          abi: nameWrapperV1IsWrappedAbi,
          functionName: "isWrapped",
          args: [namehash(name)],
        });

        if (wrapped) {
          const [, fuses] = yield* ethereum.readContract({
            address: v1.contracts.nameWrapper,
            abi: nameWrapperV1GetDataAbi,
            functionName: "getData",
            args: [BigInt(namehash(name))],
          });

          const parentRegistry = yield* ethereum.readContract({
            address: profile.v2.contracts.universalHelper,
            abi: universalHelperV2FindExactRegistryAbi,
            functionName: "findExactRegistry",
            args: [yield* dnsEncodeName.effect(analysis.parent)],
          });

          if (!isAddressEqual(parentRegistry, zeroAddress)) {
            return { status: "mirrored-child", name, parentRegistry, fuses } as const;
          }

          return {
            status: "locked-child-pending-parent",
            name,
            parent: analysis.parent,
            fuses,
          } as const;
        }
      }

      const state = yield* getNameState.effect(config, parameters);

      if (state.kind === "v2-native") {
        return { status: "not-required", name, reason: "V2_NATIVE" } as const;
      }

      if (state.kind === "v2-migrated") {
        return state.wrapped
          ? ({ status: "migrated-locked", name, registry: state.registry } as const)
          : ({ status: "migrated-unlocked", name } as const);
      }

      if (v1 === undefined) {
        return state.kind === "available"
          ? ({ status: "not-required", name, reason: "AVAILABLE" } as const)
          : ({ status: "unsupported", name, reason: "NAME_NOT_RESERVED" } as const);
      }

      if (state.kind === "available") {
        return { status: "not-required", name, reason: "AVAILABLE" } as const;
      }

      if (state.kind !== "v2-reserved") {
        return { status: "unsupported", name, reason: "NAME_NOT_RESERVED" } as const;
      }

      if (!state.wrapped) return { status: "reserved-unwrapped", name } as const;

      const [, fuses] = yield* ethereum.readContract({
        address: v1.contracts.nameWrapper,
        abi: nameWrapperV1GetDataAbi,
        functionName: "getData",
        args: [BigInt(namehash(name))],
      });

      return (fuses & nameWrapperFuses.cannotUnwrap) === nameWrapperFuses.cannotUnwrap
        ? ({ status: "reserved-wrapped-locked", name, fuses } as const)
        : ({ status: "reserved-wrapped-unlocked", name, fuses } as const);
    }),
  );
});

export const getMigrationStatus = defineReadAction<
  MigrationNameParameters,
  MigrationStatus,
  MigrationReadError
>(getMigrationStatusEffect);

export type {
  MigrationNameParameters as GetMigrationStatusParameters,
  MigrationReadError as GetMigrationStatusError,
  MigrationStatus,
} from "../types.js";
