import { Effect } from "effect";

import type { Deployments } from "@ensforge/contracts";
import type { Client } from "@ensforge/core/extension";
import type { Address } from "viem";

import { HcaError } from "../errors/classes/HcaError.js";

/** The HCA contracts of the client's deployment and what its ENSv2 contracts offer them. */
export type HcaDeployment = {
  readonly chainId: number;
  readonly contracts: Deployments.V2Hca;
  readonly v2: Deployments.V2;
  readonly verifiableFactory: Address;
};

/** The client's HCA deployment; fails on chains without one. */
export const requireHca = (client: Client): Effect.Effect<HcaDeployment, HcaError> => {
  const v2 = client.deployment.v2;
  const contracts = v2?.hca;
  if (v2 === undefined || contracts === undefined) {
    return Effect.fail(
      new HcaError({ code: "HCA_UNAVAILABLE", context: { chainId: client.chain.id } }),
    );
  }
  return Effect.succeed({
    chainId: client.chain.id,
    contracts,
    v2,
    verifiableFactory: v2.contracts.verifiableFactory,
  });
};
