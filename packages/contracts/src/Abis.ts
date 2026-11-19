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

/**
 * ENSv1 ABIs from ens-contracts, keyed by contract.
 *
 * **Example** (Reading a wrapped name owner)
 *
 * ```ts
 * import { Abis, Deployments } from "@ensforge/contracts"
 *
 * const owner = await client.readContract({
 *   address: Deployments.mainnet.v1.contracts.nameWrapper,
 *   abi: Abis.v1.nameWrapper,
 *   functionName: "ownerOf",
 *   args: [tokenId],
 * })
 * ```
 *
 * @stability stable
 */
export * as v1 from "./abis/v1.js";

/**
 * ENSv2 ABIs from contracts-v2, keyed by contract.
 *
 * @stability stable
 */
export * as v2 from "./abis/v2.js";

/**
 * ABIs shared by ENSv1 and ENSv2: token standards, resolver profiles, errors and events.
 *
 * **Example** (Reading a text record)
 *
 * ```ts
 * import { Abis } from "@ensforge/contracts"
 *
 * const url = await client.readContract({
 *   address: resolver,
 *   abi: Abis.shared.textResolver,
 *   functionName: "text",
 *   args: ["0x0000000000000000000000000000000000000000000000000000000000000000", "url"],
 * })
 * ```
 *
 * @stability stable
 */
export * as shared from "./abis/shared.js";
