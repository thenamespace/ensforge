import { Effect } from "effect";

import { Abis, InterfaceIds } from "@ensforge/contracts";
import type { Address } from "viem";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import * as Rpc from "../rpc/index.js";

/**
 * How a resolver's setters address a name: by `node` (PublicResolver, PublicResolverV2) or by
 * DNS-encoded `name` (ENSv2 PermissionedResolver).
 */
export type SetterKeying = "node" | "name";

/**
 * Detects how the resolver's setters address a name: by name for a PermissionedResolver or any
 * resolver declaring `IAddressSetter`; resolvers without ERC-165 use nodes.
 */
export const setterKeying = (
  client: Client,
  resolver: Address,
): Effect.Effect<SetterKeying, AnyError> => {
  const supports = (interfaceId: `0x${string}`) =>
    Rpc.readContractOrUndefined(client, {
      address: resolver,
      abi: Abis.shared.erc165,
      functionName: "supportsInterface",
      args: [interfaceId],
    });
  return Effect.all(
    [
      supports(InterfaceIds.resolver.permissionedResolver),
      supports(InterfaceIds.resolver.addressSetter),
    ],
    { concurrency: "unbounded" },
  ).pipe(
    Effect.map(([permissioned, addressSetter]) =>
      permissioned === true || addressSetter === true ? "name" : "node",
    ),
  );
};
