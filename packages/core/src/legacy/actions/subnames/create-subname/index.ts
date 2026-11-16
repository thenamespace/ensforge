import { Effect, Schema } from "effect";

import { verifiableFactoryV2DeployProxyAbi } from "@ensforge/contracts/internal";
import { enhancedAccessControlRoles, registryRoles } from "@ensforge/contracts/v2";
import { decodeFunctionResult, keccak256, stringToHex, zeroAddress } from "viem";

import { defineAction } from "../../../action/action.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { ContractError } from "../../../errors/contract-error.js";
import { provideConfig } from "../../../internal/config/context.js";
import { resolveWalletContext } from "../../../internal/services/wallet-client.js";
import { withWorkflow } from "../../../internal/workflows/run.js";
import { namehash } from "../../../names/hashes.js";
import { EthereumAddress } from "../../../schemas/identity.js";
import type { WritePlan } from "../../../write/types.js";
import { executeWritePlan } from "../../batch/execute-write-plan.js";
import { simulateCalls } from "../../batch/simulate-calls.js";
import { getNameState } from "../../name/get-name-state/index.js";
import { decodeOwnershipAddress } from "../../ownership/address.js";
import {
  attachSubregistryIntent,
  deployUserRegistryIntent,
  registerV2SubnameIntent,
  setRegistryParentIntent,
  v1CreateSubnameIntent,
} from "../intents.js";
import { resolveSubnameRoute } from "../route.js";
import type { CreateSubnameParameters, CreateSubnameResult, SubnameError } from "../types.js";

const ownerRoles = enhancedAccessControlRoles.allRoles & ~registryRoles.wasReserved;

const confirmed = (result: CreateSubnameResult["write"]) =>
  result.status === "completed" &&
  result.completedStages.every((stage) =>
    stage.result.calls.every((call) => call.status === "confirmed"),
  );

const planId = (name: string, owner: string, registry: string) =>
  `createSubname:${keccak256(stringToHex(JSON.stringify({ name, owner, registry })))}`;

const createSubnameEffect = Effect.fn("ensforge.createSubname")(function* (
  config: EnsforgeConfig,
  parameters: CreateSubnameParameters,
): Effect.fn.Return<CreateSubnameResult, SubnameError> {
  const route = yield* resolveSubnameRoute(config, parameters.name);
  const owner = yield* decodeOwnershipAddress(parameters.owner, "subname owner");

  const resolver =
    parameters.resolver === undefined
      ? zeroAddress
      : yield* decodeOwnershipAddress(parameters.resolver, "subname resolver");

  const expiry = parameters.expiry ?? route.parentExpiry;
  const stages: WritePlan["stages"] extends ReadonlyArray<infer Stage> ? Array<Stage> : never = [];
  let registry: typeof EthereumAddress.Type;
  let createdRegistry: typeof EthereumAddress.Type | null = null;

  if (route.protocol === "v1") {
    registry = route.parentWrapped
      ? route.deployment.contracts.nameWrapper
      : route.deployment.contracts.registry;

    stages.push({
      type: "calls",
      id: "create-subname",
      calls: [
        yield* v1CreateSubnameIntent({
          registry: route.deployment.contracts.registry,
          wrapper: route.deployment.contracts.nameWrapper,
          parentWrapped: route.parentWrapped,
          parentNode: route.parentNode,
          label: route.label,
          labelhash: route.labelhash,
          owner,
          resolver,
          ttl: parameters.ttl ?? 0n,
          fuses: parameters.fuses ?? 0,
          expiry,
        }),
      ],
      mode: parameters.mode ?? "auto",
      atomicity: "none",
      confirmation: parameters.confirmation ?? { type: "confirmed" },
    });
  } else {
    const wallet = yield* provideConfig(
      config,
      resolveWalletContext({
        ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
        ...(parameters.account === undefined ? {} : { account: parameters.account }),
      }),
    );

    const account = typeof wallet.account === "string" ? wallet.account : wallet.account.address;
    const roles = parameters.roles ?? ownerRoles;

    if (
      parameters.resume?.createdRegistry !== undefined &&
      parameters.resume.createdRegistry !== null
    ) {
      createdRegistry = parameters.resume.createdRegistry;
    } else if (route.subregistry === null) {
      const deploymentIntent = yield* deployUserRegistryIntent({
        factory: route.deployment.contracts.verifiableFactory,
        implementation: route.deployment.implementations.userRegistry,
        owner: account,
        roles: enhancedAccessControlRoles.allRoles,
        salt: parameters.salt ?? BigInt(namehash(route.parent)),
      });

      const simulation = yield* simulateCalls.effect(config, {
        calls: [deploymentIntent],
        ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
        ...(parameters.account === undefined ? {} : { account: parameters.account }),
      });

      const raw = simulation[0]?.result;

      if (raw === undefined) {
        return yield* new ContractError({
          code: "DECODE_FAILED",
          message: `Unable to predict the subregistry for ${route.parent}`,
          cause: simulation,
        });
      }

      createdRegistry = yield* Effect.try({
        try: () =>
          Schema.decodeUnknownSync(EthereumAddress)(
            decodeFunctionResult({
              abi: verifiableFactoryV2DeployProxyAbi,
              functionName: "deployProxy",
              data: raw,
            }),
          ),
        catch: (cause) =>
          new ContractError({
            code: "DECODE_FAILED",
            message: `Unable to decode the subregistry address for ${route.parent}`,
            cause,
          }),
      });
    }

    registry = createdRegistry ?? route.subregistry ?? zeroAddress;

    if (createdRegistry !== null) {
      stages.push(
        {
          type: "calls",
          id: "deploy-subregistry",
          calls: [
            yield* deployUserRegistryIntent({
              factory: route.deployment.contracts.verifiableFactory,
              implementation: route.deployment.implementations.userRegistry,
              owner: account,
              roles: enhancedAccessControlRoles.allRoles,
              salt: parameters.salt ?? BigInt(namehash(route.parent)),
            }),
          ],
          mode: "sequential",
          atomicity: "none",
          confirmation: { type: "confirmed" },
        },
        {
          type: "calls",
          id: "attach-subregistry",
          calls: [
            yield* setRegistryParentIntent({
              registry: createdRegistry,
              parentRegistry: route.parentRegistry,
              parentLabel: route.parent.split(".")[0] ?? route.parent,
            }),
            yield* attachSubregistryIntent({
              parentRegistry: route.parentRegistry,
              parentTokenId: route.parentTokenId,
              subregistry: createdRegistry,
            }),
          ],
          mode: "sequential",
          atomicity: "none",
          confirmation: { type: "confirmed" },
        },
      );
    }

    stages.push({
      type: "calls",
      id: "create-subname",
      calls: [
        yield* registerV2SubnameIntent({
          registry,
          label: route.label,
          owner,
          resolver,
          roles,
          expiry,
        }),
      ],
      mode: parameters.mode ?? "auto",
      atomicity: "none",
      confirmation: parameters.confirmation ?? { type: "confirmed" },
    });
  }

  const write = yield* executeWritePlan.effect(config, {
    plan: { id: planId(route.name, owner, registry), stages },
    ...(parameters.resume === undefined ? {} : { resume: parameters.resume.write }),
    ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
    ...(parameters.account === undefined ? {} : { account: parameters.account }),
  });

  const result = {
    name: route.name,
    parent: route.parent,
    protocol: route.protocol,
    createdRegistry,
    registry,
    write,
    finalState: null,
  } satisfies CreateSubnameResult;

  return {
    ...result,
    finalState: confirmed(write) ? yield* getNameState.effect(config, { name: route.name }) : null,
  };
});

export const createSubname = defineAction<
  CreateSubnameParameters,
  CreateSubnameResult,
  SubnameError
>(withWorkflow("createSubname", createSubnameEffect));

export type {
  CreateSubnameParameters,
  CreateSubnameResult,
  SubnameError as CreateSubnameError,
} from "../types.js";
