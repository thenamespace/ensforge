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

    const own = loaded.state.resolver;
    const address = own ?? found?.address;
    if (address === undefined) {
      if (options.strict === true)
        return yield* Effect.fail(new NotFoundError({ code: "RESOLVER_NOT_FOUND" }));
      return null;
    }

    const description = yield* describeResolver(client, address, loaded.data.parts.node, options);
    return { address, inherited: own === null, ...description };
  },
  Action.withContext("resolver.get", { contractKind: "resolver" }),
);
