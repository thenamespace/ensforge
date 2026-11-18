import { Effect } from "effect";

import { Action, type AnyError, type Client } from "@ensforge/sdk/extension";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import { checkSessionCalls as check } from "../../../internal/session.js";
import type { checkSessionCalls as Promises } from "./index.js";

/** @internal Implementation of `Actions.hca.checkSessionCalls`. */
export const checkSessionCalls = Effect.fn("ensforge.hca.checkSessionCalls")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, AnyError | HcaError> {
  yield* check(client, options.session, options.calls);
  return true as const;
}, Action.withContext("hca.checkSessionCalls"));
