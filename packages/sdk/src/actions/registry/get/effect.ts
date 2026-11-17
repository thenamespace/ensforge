import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import { NotFoundError } from "../../../errors/classes/NotFoundError.js";
import * as Action from "../../../internal/action/index.js";
import { requireAddress } from "../../../internal/name/write.js";
import { inspectRegistry } from "../../../internal/registry/inspect.js";
import { findTargetRegistry } from "../../../internal/registry/target.js";
import type { get as Promises } from "./index.js";

/** @internal Implementation of `Actions.registry.get`. */
export const get = Effect.fn("ensforge.registry.get")(
  function* (
    client: Client,
    options: Promises.Options,
  ): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
    const address = yield* findTargetRegistry(client, options, options);
    if (address === undefined) {
      if (options.strict === true) {
        return yield* Effect.fail(new NotFoundError({ code: "REGISTRY_NOT_FOUND" }));
      }
      return null;
    }

    const account =
      options.account === undefined ? undefined : yield* requireAddress(options.account, "account");
    return yield* inspectRegistry(client, address, { ...options, account });
  },
  Action.withContext("registry.get", { contractKind: "registry" }),
);
