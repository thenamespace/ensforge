import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { fromPromise } from "../../../internal/rpc/fromPromise.js";
import type { get as Promises } from "./index.js";

/** @internal Implementation of `Actions.plan.get`. */
export const get = Effect.fn("ensforge.plan.get")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, AnyError> {
  return (yield* fromPromise(() => client.config.storage.get(options.id))) ?? null;
}, Action.withContext("plan.get"));
