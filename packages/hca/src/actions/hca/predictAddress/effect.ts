import { Effect } from "effect";

import { Action, type AnyError, type Client, requireAddress } from "@ensforge/sdk/extension";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import { predictAddress as predict } from "../../../internal/account.js";
import { signerOf } from "../../../internal/input.js";
import type { predictAddress as Promises } from "./index.js";

/** @internal Implementation of `Actions.hca.predictAddress`. */
export const predictAddress = Effect.fn("ensforge.hca.predictAddress")(function* (
  client: Client,
  options: Promises.Options = {},
): Effect.fn.Return<Promises.ReturnType, AnyError | HcaError> {
  const owner =
    options.owner === undefined
      ? yield* signerOf(client, undefined)
      : yield* requireAddress(options.owner, "owner");
  return yield* predict(client, owner);
}, Action.withContext("hca.predictAddress"));
