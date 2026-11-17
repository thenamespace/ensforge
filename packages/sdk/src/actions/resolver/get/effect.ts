import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import { NotFoundError } from "../../../errors/classes/NotFoundError.js";
import * as Action from "../../../internal/action/index.js";
import { loadName } from "../../../internal/name/load.js";
import { describeResolver } from "../../../internal/resolver/describe.js";
import * as Rpc from "../../../internal/rpc/index.js";
import type { get as Promises } from "./index.js";

/** @internal Implementation of `Actions.resolver.get`. */
export const get = Effect.fn("ensforge.resolver.get")(
  function* (
    client: Client,
    options: Promises.Options,
  ): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
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
    const address = own ?? found?.address;
    if (address === undefined) return yield* notFound;

    const description = yield* describeResolver(client, address, loaded.data.parts.node, options);
    // The Universal Resolver finds the nearest resolver up the tree, but a parent's resolver
    // serves this name only as an ENSIP-10 extended resolver.
    if (own === null && found?.inherited === true && !description.profiles.extended) {
      return yield* notFound;
    }
    return { address, inherited: own === null, ...description };
  },
  Action.withContext("resolver.get", { contractKind: "resolver" }),
);
