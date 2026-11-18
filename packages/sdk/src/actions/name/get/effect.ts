import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import * as Action from "../../../internal/action/index.js";
import { loadName } from "../../../internal/name/load.js";
import { describeResolver } from "../../../internal/resolver/describe.js";
import { servingResolver } from "../../../internal/resolver/serving.js";
import * as Rpc from "../../../internal/rpc/index.js";
import type { get as Promises } from "./index.js";

/** @internal Implementation of `Actions.name.get`. */
export const get = Effect.fn("ensforge.name.get")(
  function* (
    client: Client,
    options: Promises.Options,
  ): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
    // `findResolver` shares the first multicall round with the registry reads; it matters only
    // for names without a resolver of their own, so only they fail when it does.
    const { loaded, found } = yield* Effect.all(
      {
        loaded: loadName(client, options.name, options),
        found: Effect.result(Rpc.findResolver(client, options)),
      },
      { concurrency: "unbounded" },
    );
    const { state, data } = loaded;
    if (state.resolver !== null) return { ...state, inheritedResolver: null };

    const served = yield* servingResolver(
      client,
      data.parts.name,
      yield* Effect.fromResult(found),
      options,
    );
    if (served === null) return { ...state, inheritedResolver: null };
    // A parent's resolver serves this name only as an ENSIP-10 extended resolver.
    const extended =
      !served.inherited ||
      (yield* describeResolver(client, served.address, data.parts.node, options)).profiles.extended;
    return { ...state, inheritedResolver: extended ? served.address : null };
  },
  Action.withContext("name.get", { contractKind: "registry" }),
);
