import { Array as Arr, Effect, Option, String as Str } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import { isAddressEqual, namehash, type Address } from "viem";

import type { NameNamespace } from "../../actions/name/get/types.js";
import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import { nonZeroAddress } from "../address.js";
import type { NameParts } from "../name/parts.js";
import type { ServingResolver } from "../resolver/serving.js";
import { blockAt } from "../rpc/block.js";
import * as Rpc from "../rpc/index.js";
import { chainClient, hasChain } from "../write/chain.js";

/** The resolution type of Namespace's off-chain database in the older hybrid resolvers. */
const offchainType = 9999n;

/**
 * A Namespace name. The older hybrid resolvers keep each parent's resolution type, the L2's chain
 * ID (or 9999 for the off-chain database), on the nearest configured ancestor; HybridResolverV2
 * routes names by route ID, which the deployment maps to chains. On the L2, the nearest ancestor
 * with a registry in the NodeRegistryResolver is the namespace's parent.
 */
export const locateNamespace = Effect.fnUntraced(function* (
  client: Client,
  parts: NameParts,
  served: ServingResolver,
  namespace: Deployments.NamespaceDeployment,
  block: Read.BlockOptions,
): Effect.fn.Return<NameNamespace | null, AnyError> {
  const labels = Str.split(".")(parts.name);
  // The name's ancestors from its parent up to the second-level name; a TLD is never a parent.
  const ancestors = Arr.map(labels.slice(1, -1), (_, index) =>
    Arr.join(labels.slice(index + 1), "."),
  );
  const at = blockAt(block);

  let chainId: number | undefined;
  let configured: string | undefined;
  if (isAddressEqual(served.address, namespace.hybridResolvers.v2)) {
    const route = yield* Rpc.readContract(client, {
      address: namespace.hybridResolvers.v2,
      abi: Abis.namespace.interfaces.hybridResolverV2,
      functionName: "findRoute",
      args: [parts.dns],
      ...at,
    });
    chainId = namespace.routes[Number(route)];
  } else {
    const levels = [parts.name, ...ancestors];
    const configs = yield* Effect.forEach(
      levels,
      (level) =>
        Rpc.readContract(client, {
          address: served.address,
          abi: Abis.namespace.interfaces.hybridResolver,
          functionName: "configs",
          args: [namehash(level)],
          ...at,
        }),
      { concurrency: "unbounded" },
    );
    const found = Arr.findFirstIndex(configs, ([, resolutionType]) => resolutionType !== 0n);
    const resolutionType = Option.match(found, {
      onNone: () => offchainType,
      onSome: (index) => configs[index]?.[1] ?? offchainType,
    });
    configured = Option.getOrUndefined(Option.map(found, (index) => levels[index] ?? parts.name));
    chainId = resolutionType === offchainType ? undefined : Number(resolutionType);
  }

  if (chainId === undefined) {
    const provider = Deployments.offchainProvider({
      chainId: client.deployment.chainId,
      resolver: served.address,
    });
    return { kind: "offchain", provider: provider ?? null, parent: configured ?? served.level };
  }

  const contracts = namespace.chains[chainId];
  const located = { kind: "l2", id: "namespace", chainId } as const;
  if (contracts === undefined || !hasChain(client, chainId)) {
    return { ...located, parent: configured ?? served.level, registry: null };
  }
  const registries = yield* chainClient(client, chainId).pipe(
    Effect.flatMap((l2) =>
      Effect.forEach(
        ancestors,
        (ancestor) =>
          Rpc.readContract(l2, {
            address: contracts.nodeRegistryResolver,
            abi: Abis.namespace.interfaces.nodeRegistryResolver,
            functionName: "nodeRegistries",
            args: [namehash(ancestor)],
          }),
        { concurrency: "unbounded" },
      ),
    ),
    // An L2 that does not answer leaves the registry unknown, not the location.
    Effect.catchTag("NetworkError", () => Effect.succeed<readonly Address[]>([])),
  );
  const nearest = Arr.findFirstIndex(registries, (registry) => nonZeroAddress(registry) !== null);
  return Option.match(nearest, {
    onNone: () => ({ ...located, parent: configured ?? served.level, registry: null }),
    onSome: (index) => ({
      ...located,
      parent: ancestors[index] ?? served.level,
      registry: registries[index] ?? null,
    }),
  });
});
