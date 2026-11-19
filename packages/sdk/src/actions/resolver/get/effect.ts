import { Effect } from "effect";

import { isAddressEqual } from "viem";

import type { Client } from "../../../client/types.js";
import { NotFoundError } from "../../../errors/classes/NotFoundError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { loadName } from "../../../internal/name/load.js";
import { describeResolver } from "../../../internal/resolver/describe.js";
import { isEnsV1Bridge, servingResolver } from "../../../internal/resolver/serving.js";
import * as Rpc from "../../../internal/rpc/index.js";
import type { get as Promises } from "./index.js";

/** @internal Implementation of `Actions.resolver.get`. */
export const get = Effect.fn("ensforge.resolver.get")(
  function* (
    client: Client,
    options: Promises.Options,
  ): Effect.fn.Return<Promises.ReturnType, AnyError> {
    // Both run in the first multicall round: the registry knows the name's own resolver, the
    // Universal Resolver knows which one serves it when there is none.
    const { loaded, found } = yield* Effect.all(
      {
        loaded: loadName(client, options.name, options),
        found: Rpc.findResolver(client, options),
      },
      { concurrency: "unbounded" },
    );

    const notFound =
      options.strict === true
        ? Effect.fail(new NotFoundError({ code: "RESOLVER_NOT_FOUND" }))
        : Effect.succeed(null);
    const own = loaded.state.resolver;
    // ENSv2 sends premigrated ENSv1 names to the ENSv1 bridge, which resolves them from the ENSv1
    // registry: describe the ENSv1 resolver it uses, as before the launch.
    const viaBridge = found !== null && isEnsV1Bridge(client, found.address);
    const served =
      own === null ? yield* servingResolver(client, loaded.data.parts.name, found, options) : null;
    // A name a parent's resolver serves may live on an L2: describe its resolver there.
    if (own === null && served?.inherited === true) {
      const { l2Client, l2LocationOf } = yield* Effect.promise(
        () => import("../../../internal/name/location.js"),
      );
      const location = yield* l2LocationOf(client, loaded.data.parts, options);
      const l2 = location === null ? null : yield* l2Client(client, location, options.strict);
      if (location !== null && l2 !== null) {
        const { l2ResolverOf } = yield* Effect.promise(
          () => import("../../../internal/namespace/l2/index.js"),
        );
        const resolver = yield* l2ResolverOf(l2, location, loaded.data.parts);
        if (resolver === null) return yield* notFound;
        const description = yield* describeResolver(l2, resolver, loaded.data.parts.node, {});
        // Every L2 namespace's resolver lets the name's owner write its records.
        return {
          address: resolver,
          inherited: false,
          serving: true,
          ...description,
          authorization: "owner",
        };
      }
    }

    const address = own ?? served?.address;
    if (address === undefined) return yield* notFound;

    const description = yield* describeResolver(client, address, loaded.data.parts.node, options);
    // A parent's resolver serves this name only as an ENSIP-10 extended resolver.
    if (own === null && served?.inherited === true && !description.profiles.extended) {
      return yield* notFound;
    }
    const serving =
      own === null || viaBridge || (found !== null && isAddressEqual(found.address, own));
    return { address, inherited: own === null, serving, ...description };
  },
  Action.withContext("resolver.get", { contractKind: "resolver" }),
);
