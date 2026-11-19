import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { servedNamespace } from "../../../internal/name/namespace.js";
import { parseName } from "../../../internal/name/normalize.js";
import { inheritedResolver } from "../../../internal/name/served.js";
import * as Rpc from "../../../internal/rpc/index.js";
import type { getNamespace as Promises } from "./index.js";

/** @internal Implementation of `Actions.name.getNamespace`. */
export const getNamespace = Effect.fn("ensforge.name.getNamespace")(
  function* (
    client: Client,
    options: Promises.Options,
  ): Effect.fn.Return<Promises.ReturnType, AnyError> {
    const parts = yield* parseName(options.name);
    const found = yield* Rpc.findResolver(client, { ...options, name: parts.name });
    const served = yield* inheritedResolver(client, parts, found, options);
    if (served === null || !served.inherited) return null;

    const { namespace } = yield* servedNamespace(client, parts, served, options);
    return namespace;
  },
  Action.withContext("name.getNamespace", { contractKind: "resolver" }),
);
