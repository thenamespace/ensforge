import { Effect, Array as Arr, Option, String as Str } from "effect";

import { Abis } from "@ensforge/contracts";
import { isAddressEqual, type Address } from "viem";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import { namehash } from "../../utils/Name.js";
import { nonZeroAddress, sameAddress } from "../address.js";
import { blockAt } from "../rpc/block.js";
import * as Rpc from "../rpc/index.js";

/** A resolver that resolution reaches for a name. */
export type ServingResolver = {
  readonly address: Address;
  /** Whether it is set on an ancestor (an ENSIP-10 wildcard) rather than on the name itself. */
  readonly inherited: boolean;
};

/**
 * Whether `resolver` is the ENSv1 bridge (`ENSV1Resolver`), which ENSv2 sends names still on
 * ENSv1 to after the launch.
 */
export const isEnsV1Bridge = (client: Client, resolver: Address): boolean => {
  const bridge = client.deployment.v2?.migration.ensV1Resolver;
  return bridge !== undefined && isAddressEqual(resolver, bridge);
};

/**
 * The ENSv1 resolver the ENSv1 bridge resolves `name` (normalized) with: the name's own in the
 * ENSv1 registry, or its nearest ancestor's; `null` when none has one. All levels are read in one
 * batched round. The ENSv2 resolver (on `eth` after the launch) counts as unset: it sends the
 * name back to ENSv2, and the loop ends in `UnreachableName`.
 */
export const behindEnsV1Bridge = (
  client: Client,
  name: string,
  block: Read.BlockOptions,
): Effect.Effect<ServingResolver | null, AnyError> => {
  const registry = client.deployment.v1?.contracts.registry;
  if (registry === undefined) return Effect.succeed(null);
  const loop = client.deployment.v2?.contracts.ensV2Resolver;

  const labels = Str.split(".")(name);
  const levels = Arr.map(labels, (_, index) => Arr.join(labels.slice(index), "."));
  const at = blockAt(block);
  return Effect.forEach(
    levels,
    (level) =>
      Rpc.readContract(client, {
        address: registry,
        abi: Abis.v1.ensRegistry,
        functionName: "resolver",
        args: [namehash(level)],
        ...at,
      }),
    { concurrency: "unbounded" },
  ).pipe(
    Effect.map((resolvers) =>
      Option.match(
        Arr.findFirstWithIndex(
          resolvers,
          (resolver) => nonZeroAddress(resolver) !== null && !sameAddress(loop, resolver),
        ),
        { onNone: () => null, onSome: ([address, index]) => ({ address, inherited: index > 0 }) },
      ),
    ),
  );
};

/**
 * The resolver resolution reaches for `name` (normalized) from what the Universal Resolver's
 * `findResolver` returned: that resolver, or the ENSv1 resolver behind the ENSv1 bridge. A
 * parent's resolver serves the name only when it is an ENSIP-10 extended resolver, which the
 * caller checks (`describeResolver` reports it).
 */
export const servingResolver = (
  client: Client,
  name: string,
  found: Rpc.FoundResolver | null,
  block: Read.BlockOptions,
): Effect.Effect<ServingResolver | null, AnyError> =>
  found !== null && isEnsV1Bridge(client, found.address)
    ? behindEnsV1Bridge(client, name, block)
    : Effect.succeed(found);
