import { Effect } from "effect";

import { Action, type Client } from "@ensforge/sdk/extension";

import { sessionProblem } from "../../../internal/session.js";
import type { getSession as Promises } from "./index.js";

/** @internal Implementation of `Actions.hca.getSession`. */
export const getSession = Effect.fn("ensforge.hca.getSession")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
  const problem = yield* sessionProblem(client, options.session);
  return { valid: problem === undefined, problem: problem ?? null };
}, Action.withContext("hca.getSession"));
