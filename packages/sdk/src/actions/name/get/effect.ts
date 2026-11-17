import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import * as Action from "../../../internal/action/index.js";
import { loadName } from "../../../internal/name/load.js";
import type { get as Promises } from "./index.js";

/** @internal Implementation of `Actions.name.get`. */
export const get = Effect.fn("ensforge.name.get")(
  function* (
    client: Client,
    options: Promises.Options,
  ): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
    const { state } = yield* loadName(client, options.name, options);
    return state;
  },
  Action.withContext("name.get", { contractKind: "registry" }),
);
