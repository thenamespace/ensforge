import { Effect } from "effect";

import type { Address } from "viem";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import { erc165Abi } from "../abis/resolver.js";
import * as Rpc from "../rpc/index.js";

/** ERC-165 ID of the ENSv2 `IPermissionedResolver` (contracts-v2 v1.0.1). */
const permissionedResolverInterfaceId = "0x8c2427cc";

/**
 * How a resolver's setters address a name: `node` (PublicResolver, PublicResolverV2) or `name`
 * (ENSv2 PermissionedResolver, which takes the DNS-encoded name).
 */
export type ResolverKind = "node" | "name";

/** Detects the resolver kind; resolvers without ERC-165 are node-based. */
export const resolverKind = (
  client: Client,
  resolver: Address,
): Effect.Effect<ResolverKind, AnyError> =>
  Rpc.readContractOrUndefined(client, {
    address: resolver,
    abi: erc165Abi,
    functionName: "supportsInterface",
    args: [permissionedResolverInterfaceId],
  }).pipe(Effect.map((permissioned) => (permissioned === true ? "name" : "node")));
