import { Effect } from "effect";

import { InterfaceIds } from "@ensforge/contracts";
import type { Address } from "viem";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import { erc165Abi } from "../abis/resolver.js";
import * as Rpc from "../rpc/index.js";

/**
 * How a resolver's setters address a name: by `node` (PublicResolver, PublicResolverV2) or by
 * DNS-encoded `name` (ENSv2 PermissionedResolver).
 */
export type SetterKeying = "node" | "name";

/** Detects how the resolver's setters address a name; resolvers without ERC-165 use nodes. */
export const setterKeying = (
  client: Client,
  resolver: Address,
): Effect.Effect<SetterKeying, AnyError> =>
  Rpc.readContractOrUndefined(client, {
    address: resolver,
    abi: erc165Abi,
    functionName: "supportsInterface",
    args: [InterfaceIds.resolver.permissionedResolver],
  }).pipe(Effect.map((permissioned) => (permissioned === true ? "name" : "node")));
