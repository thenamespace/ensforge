import { Effect } from "effect";

import { Abis, type Deployments } from "@ensforge/contracts";
import type { Address } from "viem";

import type { Client } from "../../client/types.js";
import { UnsupportedError } from "../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../errors/types.js";
import * as Rpc from "../rpc/index.js";

/** The contracts `.eth` registration and renewal use. */
export type RegistrationContracts = {
  /** ENSv2 ETHRegistrar: registers every new name and renews ENSv2 names. */
  readonly registrar: Address;
  /** ETHRegistry: the ENSv2 registry of `.eth` second-level names. */
  readonly ethRegistry: Address;
  /** ETHRenewerV1: renews names still on ENSv1. */
  readonly renewer: Address;
  /** The registrar's current rent price oracle; its owner can replace it, so it is read live. */
  readonly oracle: Address;
  /** VerifiableFactory and PermissionedResolver implementation, for per-name resolvers. */
  readonly resolverFactory: Address;
  readonly resolverImplementation: Address;
  readonly paymentTokens: Deployments.V2PaymentTokens | undefined;
};

/**
 * Registration contracts of the deployment. ENSv1 controllers no longer register names (they are
 * not BaseRegistrar controllers since the ENSv2 launch), so registration needs ENSv2.
 */
export const requireRegistrationContracts = Effect.fnUntraced(function* (
  client: Client,
): Effect.fn.Return<RegistrationContracts, AnyError> {
  const v2 = client.deployment.v2;
  if (v2 === undefined) {
    return yield* Effect.fail(
      new UnsupportedError({ code: "UNSUPPORTED_ON_DEPLOYMENT", feature: ".eth registration" }),
    );
  }
  const oracle = yield* Rpc.readContract(client, {
    address: v2.contracts.ethRegistrar,
    abi: Abis.v2.ethRegistrar,
    functionName: "rentPriceOracle",
  });

  return {
    registrar: v2.contracts.ethRegistrar,
    ethRegistry: v2.contracts.ethRegistry,
    renewer: v2.migration.ethRenewerV1,
    oracle,
    resolverFactory: v2.contracts.verifiableFactory,
    resolverImplementation: v2.implementations.permissionedResolver,
    paymentTokens: v2.paymentTokens,
  };
});
