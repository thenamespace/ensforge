import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { standaloneHcaFactoryV2Abi } from "@ensforge/contracts/v2/experimental/hca";
import { Rpc, requireAddress } from "@ensforge/sdk/extension";
import { Action, type Client } from "@ensforge/sdk/extension";

import { requireHca } from "../../../internal/deployment.js";
import type { getGovernance as Promises } from "./index.js";

/** @internal Implementation of `Actions.hcaAdmin.getGovernance`. */
export const getGovernance = Effect.fn("ensforge.hcaAdmin.getGovernance")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
  const deployment = yield* requireHca(client);
  const factoryOwner = yield* Rpc.readContract(client, {
    address: deployment.contracts.standaloneFactory,
    abi: standaloneHcaFactoryV2Abi,
    functionName: "owner",
  });
  if (options.implementation === undefined) {
    return {
      factoryOwner,
      upgradeSet: deployment.contracts.upgradeSet,
      deploymentApproved: null,
      upgradeApproved: null,
    };
  }
  const implementation = yield* requireAddress(options.implementation, "implementation");
  const [deploymentApproved, upgradeApproved] = yield* Effect.all([
    Rpc.readContract(client, {
      address: deployment.contracts.standaloneFactory,
      abi: standaloneHcaFactoryV2Abi,
      functionName: "approvedImplementations",
      args: [implementation],
    }),
    Rpc.readContract(client, {
      address: deployment.contracts.upgradeSet,
      abi: Abis.v2.permissionedAddressSet,
      functionName: "includes",
      args: [implementation],
    }),
  ]);
  return {
    factoryOwner,
    upgradeSet: deployment.contracts.upgradeSet,
    deploymentApproved,
    upgradeApproved,
  };
}, Action.withContext("hcaAdmin.getGovernance"));
