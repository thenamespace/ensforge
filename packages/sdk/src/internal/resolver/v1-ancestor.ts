import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { isAddressEqual, type Address } from "viem";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import { namehash } from "../../utils/Name.js";
import { nonZeroAddress } from "../address.js";
import * as Rpc from "../rpc/index.js";

/**
 * The resolver set on the nearest ancestor of `name` in the ENSv1 registry, as the ENSv1 bridge
 * finds it for names without one of their own; `null` when no ancestor has one. The ENSv2
 * resolver (on `eth` after the launch) counts as unset: it sends the name back to ENSv2, and the
 * loop ends in `UnreachableName`.
 */
export const nearestV1AncestorResolver = (
  client: Client,
  name: string,
  block: Read.BlockOptions,
): Effect.Effect<{ readonly address: Address; readonly inherited: true } | null, AnyError> => {
  const registry = client.deployment.v1?.contracts.registry;
  if (registry === undefined) return Effect.succeed(null);
  const loop = client.deployment.v2?.contracts.ensV2Resolver;

  const labels = name.split(".");
  const ancestors = labels.slice(1).map((_, index) => labels.slice(index + 1).join("."));
  const at =
    block.blockNumber === undefined
      ? { blockTag: block.blockTag }
      : { blockNumber: block.blockNumber };
  return Effect.forEach(
    ancestors,
    (ancestor) =>
      Rpc.readContract(client, {
        address: registry,
        abi: Abis.v1.ensRegistry,
        functionName: "resolver",
        args: [namehash(ancestor)],
        ...at,
      }),
    { concurrency: "unbounded" },
  ).pipe(
    Effect.map((resolvers) => {
      const address = resolvers.find(
        (resolver) =>
          nonZeroAddress(resolver) !== null &&
          (loop === undefined || !isAddressEqual(resolver, loop)),
      );
      return address === undefined ? null : { address, inherited: true as const };
    }),
  );
};
