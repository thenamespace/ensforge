// Free identifiers shared by the JSDoc examples, checked by scripts/check-examples.mjs. They stand
// for values the reader's app already has.
import type { Deployments } from "@ensforge/contracts";
import type { Address, PublicClient } from "viem";

declare global {
  const client: PublicClient;
  const publicClient: PublicClient;
  const address: Address;
  const account: Address;
  const owner: Address;
  const resolver: Address;
  const factory: Address;
  const proxyLogic: Address;
  const tokenId: bigint;
  const bitmap: bigint;
  const devnetAddresses: Omit<NonNullable<Deployments.Profile["v2"]>, "capabilities">;
}
