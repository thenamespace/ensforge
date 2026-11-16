import { Effect } from "effect";

import {
  baseRegistrarV1GetApprovedAbi,
  baseRegistrarV1IsApprovedForAllAbi,
  baseRegistrarV1OwnerOfAbi,
  nameWrapperV1GetApprovedAbi,
  nameWrapperV1GetDataAbi,
  nameWrapperV1IsApprovedForAllAbi,
} from "@ensforge/contracts/internal";
import { nameWrapperFuses } from "@ensforge/contracts/v1";
import { isAddressEqual, zeroAddress } from "viem";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import type { EthereumAddress } from "../../../schemas/identity.js";
import { getMigrationStatus } from "../get-migration-status/index.js";
import { getMigrationTarget } from "../get-migration-target/index.js";
import type {
  MigrationBlocker,
  MigrationEligibility,
  MigrationNameParameters,
  MigrationReadError,
} from "../types.js";

export type GetMigrationEligibilityParameters = MigrationNameParameters & {
  readonly account: EthereumAddress;
};

const getMigrationEligibilityEffect = Effect.fn("ensforge.getMigrationEligibility")(function* (
  config: EnsforgeConfig,
  parameters: GetMigrationEligibilityParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const [status, target] = yield* Effect.all(
        [
          getMigrationStatus.effect(config, parameters),
          getMigrationTarget.effect(config, parameters),
        ] as const,
        { concurrency: "unbounded" },
      );

      const blockers: Array<MigrationBlocker> = [];

      if (!target.supported) {
        if (status.status === "locked-child-pending-parent") blockers.push("PARENT_NOT_MIGRATED");
        else if (status.status === "unsupported") blockers.push(status.reason);
        else if (status.status === "migrated-unlocked" || status.status === "migrated-locked") {
          blockers.push("NAME_ALREADY_MIGRATED");
        } else blockers.push("NAME_AVAILABLE");

        return {
          name,
          eligible: false,
          status,
          target,
          account: parameters.account,
          owner: null,
          authorized: false,
          blockers,
        } satisfies MigrationEligibility;
      }

      const ethereum = yield* EthereumClient;

      const owner =
        target.tokenStandard === "erc721"
          ? yield* ethereum.readContract({
              address: target.tokenContract,
              abi: baseRegistrarV1OwnerOfAbi,
              functionName: "ownerOf",
              args: [target.tokenId],
            })
          : yield* ethereum
              .readContract({
                address: target.tokenContract,
                abi: nameWrapperV1GetDataAbi,
                functionName: "getData",
                args: [target.tokenId],
              })
              .pipe(Effect.map(([wrappedOwner]) => wrappedOwner));

      const [approved, operatorApproved] =
        target.tokenStandard === "erc721"
          ? yield* Effect.all(
              [
                ethereum.readContract({
                  address: target.tokenContract,
                  abi: baseRegistrarV1GetApprovedAbi,
                  functionName: "getApproved",
                  args: [target.tokenId],
                }),
                ethereum.readContract({
                  address: target.tokenContract,
                  abi: baseRegistrarV1IsApprovedForAllAbi,
                  functionName: "isApprovedForAll",
                  args: [owner, parameters.account],
                }),
              ] as const,
              { concurrency: "unbounded" },
            )
          : yield* Effect.all(
              [
                ethereum.readContract({
                  address: target.tokenContract,
                  abi: nameWrapperV1GetApprovedAbi,
                  functionName: "getApproved",
                  args: [target.tokenId],
                }),
                ethereum.readContract({
                  address: target.tokenContract,
                  abi: nameWrapperV1IsApprovedForAllAbi,
                  functionName: "isApprovedForAll",
                  args: [owner, parameters.account],
                }),
              ] as const,
              { concurrency: "unbounded" },
            );

      const authorized =
        isAddressEqual(owner, parameters.account) ||
        isAddressEqual(approved, parameters.account) ||
        operatorApproved;

      if (!authorized) blockers.push("ACCOUNT_NOT_OWNER_OR_OPERATOR");

      if (
        status.status === "reserved-wrapped-locked" ||
        status.status === "reserved-wrapped-unlocked" ||
        status.status === "mirrored-child"
      ) {
        if ((status.fuses & nameWrapperFuses.cannotTransfer) !== 0) {
          blockers.push("TRANSFER_DISABLED");
        }

        if (
          (status.fuses & nameWrapperFuses.cannotApprove) !== 0 &&
          !isAddressEqual(approved, zeroAddress)
        ) {
          blockers.push("FROZEN_TOKEN_APPROVAL");
        }
      }

      return {
        name,
        eligible: blockers.length === 0,
        status,
        target,
        account: parameters.account,
        owner,
        authorized,
        blockers,
      } satisfies MigrationEligibility;
    }),
  );
});

export const getMigrationEligibility = defineReadAction<
  GetMigrationEligibilityParameters,
  MigrationEligibility,
  MigrationReadError
>(getMigrationEligibilityEffect);

export type {
  MigrationEligibility,
  MigrationReadError as GetMigrationEligibilityError,
} from "../types.js";
