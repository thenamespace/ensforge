import { Array as Arr, Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { multicall3Abi, type Address, type Hex } from "viem";
import { call } from "viem/actions";

import type { Client } from "../../../client/types.js";
import { NotFoundError } from "../../../errors/classes/NotFoundError.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../../errors/types.js";
import { nonZeroAddress } from "../../address.js";
import type { L2Location } from "../../name/location.js";
import type { NameParts } from "../../name/parts.js";
import type { Resolved } from "../../records/resolve.js";
import * as Rpc from "../../rpc/index.js";

/**
 * The resolver of a name on its L2 (`client` is on that chain): the one its registry records
 * (Basenames, Linea Names), the registry itself (Celonames, Durin), or the chain's shared
 * NamePublicResolver (Namespace).
 */
export const l2ResolverOf = (
  client: Client,
  location: L2Location,
  parts: NameParts,
): Effect.Effect<Address | null, AnyError> => {
  const namespaces = client.deployment.namespaces ?? {};
  switch (location.id) {
    case "basenames":
    case "linea": {
      const registry = namespaces[location.id]?.contracts.registry;
      return registry === undefined
        ? Effect.succeed(null)
        : Rpc.readContract(client, {
            address: registry,
            abi: Abis.v1.ensRegistry,
            functionName: "resolver",
            args: [parts.node],
          }).pipe(Effect.map(nonZeroAddress));
    }
    case "celonames":
    case "durin":
      return Effect.succeed(location.registry);
    default:
      // Namespace.
      return Effect.succeed(namespaces.namespace?.chains[location.chainId]?.publicResolver ?? null);
  }
};

/** `calls` to `resolver`, each answered or `undefined` when it reverts (a profile it lacks). */
const callEach = (
  client: Client,
  resolver: Address,
  calls: readonly Hex[],
): Effect.Effect<readonly (Hex | undefined)[], AnyError> => {
  const multicall3 = client.client().chain?.contracts?.multicall3?.address;
  if (multicall3 === undefined) {
    // A chain ensforge has no definition for: one call at a time.
    return Effect.forEach(
      calls,
      (data) =>
        Rpc.fromPromise(() => call(client.client(), { to: resolver, data }), {
          contract: resolver,
        }).pipe(
          Effect.map(({ data: result }) => result),
          Effect.catchIf(
            (error: AnyError) => error.context.revert !== undefined,
            () => Effect.undefined,
          ),
        ),
      { concurrency: "unbounded" },
    );
  }

  return Rpc.readContract(client, {
    address: multicall3,
    abi: multicall3Abi,
    functionName: "aggregate3",
    args: [Arr.map(calls, (callData) => ({ target: resolver, allowFailure: true, callData }))],
  }).pipe(
    Effect.map((results) =>
      Arr.map(results, ({ success, returnData }) =>
        success && returnData !== "0x" ? returnData : undefined,
      ),
    ),
  );
};

/**
 * Record calls answered by a name's resolver on its L2, as `resolveCalls` answers them through
 * the Universal Resolver: a missing resolver or a resolver that answers none of the calls is
 * "no records", or an error with `strict`.
 */
export const resolveOnL2: (
  client: Client,
  location: L2Location,
  parts: NameParts,
  calls: readonly Hex[],
  strict: boolean | undefined,
) => Effect.Effect<Resolved, AnyError> = Effect.fnUntraced(function* (
  client: Client,
  location: L2Location,
  parts: NameParts,
  calls: readonly Hex[],
  strict: boolean | undefined,
): Effect.fn.Return<Resolved, AnyError> {
  const resolver = yield* l2ResolverOf(client, location, parts);
  if (resolver === null) {
    if (strict === true) {
      return yield* Effect.fail(
        new NotFoundError({ code: "RESOLVER_NOT_FOUND", context: { chainId: location.chainId } }),
      );
    }
    return { resolver: null, results: Arr.map(calls, () => undefined) };
  }

  const results = yield* callEach(client, resolver, calls);
  if (strict === true && Arr.every(results, (result) => result === undefined)) {
    return yield* Effect.fail(
      new UnsupportedError({
        code: "RESOLVER_PROFILE_UNSUPPORTED",
        context: { contract: resolver, chainId: location.chainId },
      }),
    );
  }
  return { resolver, results };
});
