import { Effect } from "effect";

import { Action, type Client } from "@ensforge/core/extension";

import { accountInput } from "../../../internal/input.js";
import type { get as Promises } from "./index.js";

/** @internal Implementation of `Actions.hca.get`. */
export const get = Effect.fn("ensforge.hca.get")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
  return yield* accountInput(client, options);
}, Action.withContext("hca.get"));
