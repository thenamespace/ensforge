import { Effect } from "effect";

import type { Deployments } from "@ensforge/contracts";
import type { Address } from "viem";

import type { Client } from "../../client/types.js";
import { UnsupportedError } from "../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../errors/types.js";

/** The contracts `.eth` registration and renewal use. */
export type RegistrationContracts = {
  /** ENSv2 ETHRegistrar: registers every new name and renews ENSv2 names. */
  readonly registrar: Address;
  /** ETHRegistry: the ENSv2 registry of `.eth` second-level names. */
  readonly ethRegistry: Address;
  /** ETHRenewerV1: renews names still on ENSv1. */
  readonly renewer: Address;
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
export const requireRegistrationContracts = (
  client: Client,
): Effect.Effect<RegistrationContracts, AnyError> => {
  const v2 = client.deployment.v2;
  if (v2 === undefined) {
    return Effect.fail(
      new UnsupportedError({ code: "UNSUPPORTED_ON_DEPLOYMENT", feature: ".eth registration" }),
    );
  }
  return Effect.succeed({
    registrar: v2.contracts.ethRegistrar,
    ethRegistry: v2.contracts.ethRegistry,
    renewer: v2.migration.ethRenewerV1,
    oracle: v2.contracts.rentPriceOracle,
    resolverFactory: v2.contracts.verifiableFactory,
    resolverImplementation: v2.implementations.permissionedResolver,
    paymentTokens: v2.paymentTokens,
  });
};
