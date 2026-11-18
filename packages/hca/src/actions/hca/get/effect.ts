import { Effect } from "effect";

import { Action, type AnyError, type Client } from "@ensforge/sdk/extension";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import { accountInput } from "../../../internal/input.js";
import type { get as Promises } from "./index.js";

/** @internal Implementation of `Actions.hca.get`. */
export const get = Effect.fn("ensforge.hca.get")(function* (
  client: Client,
  options: Promises.Options = {},
): Effect.fn.Return<Promises.ReturnType, AnyError | HcaError> {
  return yield* accountInput(client, options);
}, Action.withContext("hca.get"));
