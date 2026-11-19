import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { loadName } from "../../../internal/name/load.js";
import { servedNamespace } from "../../../internal/name/namespace.js";
import { inheritedResolver } from "../../../internal/name/served.js";
import { toServedState } from "../../../internal/name/state.js";
import * as Rpc from "../../../internal/rpc/index.js";
import type { get as Promises } from "./index.js";

/** @internal Implementation of `Actions.name.get`. */
export const get = Effect.fn("ensforge.name.get")(
  function* (
    client: Client,
    options: Promises.Options,
  ): Effect.fn.Return<Promises.ReturnType, AnyError> {
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
    const ens = { chainId: client.chain.id, namespace: null };
    if (state.resolver !== null) return { ...state, ...ens, inheritedResolver: null };

    const foundName = yield* Effect.fromResult(found);
    const served = yield* inheritedResolver(client, data.parts, foundName, options);
    if (served === null) return { ...state, ...ens, inheritedResolver: null };
    if (loaded.kind !== "available" || !served.inherited) {
      return { ...state, ...ens, inheritedResolver: served.address };
    }

    const { kind, namespace } = yield* servedNamespace(client, data.parts, served, options);
    return {
      ...(kind === null ? state : toServedState(state, kind)),
      chainId: namespace?.kind === "l2" ? namespace.chainId : client.chain.id,
      namespace,
      inheritedResolver: served.address,
    };
  },
  Action.withContext("name.get", { contractKind: "registry" }),
);
