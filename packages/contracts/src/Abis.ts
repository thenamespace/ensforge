/**
 * Contract ABIs as `as const` arrays for viem's type inference, grouped by protocol.
 *
 * **Example** (Reading from a registry)
 *
 * ```ts
 * import { Abis, Deployments } from "@ensforge/contracts"
 *
 * const owner = await client.readContract({
 *   address: Deployments.mainnet.v2.contracts.ethRegistry,
 *   abi: Abis.v2.permissionedRegistry,
 *   functionName: "ownerOf",
 *   args: [tokenId],
 * })
 * ```
 *
 * @since 1.0.0
 */
export * as v1 from "./abis/v1.js";
export * as v2 from "./abis/v2.js";
export * as shared from "./abis/shared.js";
