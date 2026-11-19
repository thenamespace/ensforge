import { Effect, String as Str } from "effect";

import { Deployments } from "@ensforge/contracts";

import type { NameNamespace } from "../../actions/name/get/types.js";
import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import type { NameParts } from "../name/parts.js";
import type { ServingResolver } from "../resolver/serving.js";
import { locateDurin } from "./durin.js";
import { locateNamespace } from "./hybrid.js";

/**
 * Where a name that an ancestor's resolver serves lives, from that resolver: an L2 namespace of
 * the client's deployment (`Deployments.Profile.namespaces`), an off-chain provider ensforge
 * knows, or `null`. Matching the resolver, not the name, means a parent that changed resolvers is
 * never taken for its old namespace. Loaded only for names served from outside the registries.
 */
export const locate = Effect.fnUntraced(function* (
  client: Client,
  parts: NameParts,
  served: ServingResolver,
  block: Read.BlockOptions,
): Effect.fn.Return<NameNamespace | null, AnyError> {
  const namespaces = client.deployment.namespaces ?? {};
  const id = Deployments.namespaceOf({ profile: client.deployment, resolver: served.address });

  switch (id) {
    case "basenames":
    case "linea":
    case "celonames": {
      const namespace = namespaces[id];
      // Only names under the listed parent: the resolver may also serve others.
      if (namespace === undefined || !Str.endsWith(`.${namespace.parent}`)(parts.name)) return null;
      return {
        kind: "l2",
        id,
        parent: namespace.parent,
        chainId: namespace.chainId,
        registry: namespace.contracts.registry,
      };
    }
    case "durin":
      return namespaces.durin === undefined
        ? null
        : yield* locateDurin(client, parts, namespaces.durin, block);
    case "namespace":
      return namespaces.namespace === undefined
        ? null
        : yield* locateNamespace(client, parts, served, namespaces.namespace, block);
    default: {
      const provider = Deployments.offchainProvider({
        chainId: client.deployment.chainId,
        resolver: served.address,
      });
      return provider === undefined ? null : { kind: "offchain", provider, parent: served.level };
    }
  }
});
