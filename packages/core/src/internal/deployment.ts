import type { Address } from "viem";

import type { Client } from "../client/types.js";

/** The public Universal Resolver of the client's deployment (the same proxy on v1 and v2). */
export const universalResolverOf = (client: Client): Address => {
  const address =
    client.deployment.v2?.contracts.universalResolver ??
    client.deployment.v1?.contracts.universalResolver;

  // Deployments.define guarantees at least one protocol, and both require a universalResolver.
  if (address === undefined) throw new Error("deployment has no Universal Resolver");
  return address;
};
