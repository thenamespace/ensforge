import { Effect } from "effect";

import { resolverInterfaceIds } from "@ensforge/contracts/v2";

import { findResolver } from "../../actions/resolution/get-resolver/find.js";
import type { NormalizedName } from "../../schemas/name.js";
import { readNameRoute } from "../name/name-route.js";
import { supportsInterface } from "./interface-support.js";

export const readResolverPermissionTarget = Effect.fn("readResolverPermissionTarget")(function* (
  name: NormalizedName,
) {
  const [route, discovery] = yield* Effect.all([readNameRoute(name), findResolver(name)] as const, {
    concurrency: "unbounded",
  });

  const protocol = route.kind === "v1" || route.kind === "reserved" ? "v1" : "v2";

  if (discovery === null) {
    return { supported: false, protocol, reason: "RESOLVER_NOT_FOUND" } as const;
  }

  const supported = yield* supportsInterface(
    discovery.address,
    resolverInterfaceIds.permissionedResolver,
  );

  if (!supported) {
    return {
      supported: false,
      protocol,
      reason: "ROLE_BASED_PERMISSIONS_UNSUPPORTED",
    } as const;
  }

  return {
    supported: true,
    protocol: "v2",
    resolver: discovery.address,
    node: discovery.node,
    inherited: discovery.offset > 0n,
  } as const;
});
