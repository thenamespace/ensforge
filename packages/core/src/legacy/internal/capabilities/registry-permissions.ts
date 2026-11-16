import { Effect } from "effect";

import { permissionedRegistryV2InterfaceGetResourceAbi } from "@ensforge/contracts/internal";
import { registryInterfaceIds } from "@ensforge/contracts/v2";

import { labelhash } from "../../names/hashes.js";
import type { NormalizedName } from "../../schemas/name.js";
import { EthereumClient } from "../client/ethereum-client.js";
import { readNameRoute } from "../name/name-route.js";
import { supportsInterface } from "./interface-support.js";

export const readRegistryPermissionTarget = Effect.fn("readRegistryPermissionTarget")(function* (
  name: NormalizedName,
) {
  const route = yield* readNameRoute(name);

  if (route.kind === "v1" || route.kind === "reserved") {
    return {
      supported: false,
      protocol: "v1",
      reason: "ROLE_BASED_PERMISSIONS_UNSUPPORTED",
    } as const;
  }

  const supported = yield* supportsInterface(
    route.parentRegistry,
    registryInterfaceIds.permissionedRegistry,
  );

  if (!supported) {
    return {
      supported: false,
      protocol: "v2",
      reason: "ROLE_BASED_PERMISSIONS_UNSUPPORTED",
    } as const;
  }

  const ethereum = yield* EthereumClient;
  const anyId = BigInt(labelhash(route.label));

  const resource = yield* ethereum.readContract({
    address: route.parentRegistry,
    abi: permissionedRegistryV2InterfaceGetResourceAbi,
    functionName: "getResource",
    args: [anyId],
  });

  return {
    supported: true,
    protocol: "v2",
    registry: route.parentRegistry,
    anyId,
    resource,
  } as const;
});
