import { Effect } from "effect";

import { Action, type Client } from "@ensforge/core/extension";

import { HcaError } from "../../../errors/classes/HcaError.js";
import { accountInput } from "../../../internal/input.js";
import type { verify as Promises } from "./index.js";

/** @internal Implementation of `Actions.hca.verify`. */
export const verify = Effect.fn("ensforge.hca.verify")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
  const account = yield* accountInput(client, options);
  if (account.problems.length > 0) {
    return yield* Effect.fail(
      new HcaError({ code: "HCA_NOT_VERIFIED", details: account.problems.map(String) }),
    );
  }
  return account;
}, Action.withContext("hca.verify"));
