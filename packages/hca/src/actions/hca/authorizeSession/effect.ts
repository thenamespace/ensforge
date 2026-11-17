import { Effect } from "effect";

import { requireAddress, resolveSigner, addressOf } from "@ensforge/sdk/extension";
import { Action, type Client } from "@ensforge/sdk/extension";

import { authorize } from "../../../internal/session.js";
import type { authorizeSession as Promises } from "./index.js";

/** @internal Implementation of `Actions.hca.authorizeSession`. */
export const authorizeSession = Effect.fn("ensforge.hca.authorizeSession")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
  const sessionKey = yield* requireAddress(options.sessionKey, "sessionKey");
  const resolver = yield* requireAddress(options.resolver, "resolver");
  const signer = yield* resolveSigner(client, options.account);
  const owner = addressOf(signer.account) as `0x${string}`;
  return yield* authorize(client, signer.walletClient, owner, {
    sessionKey,
    resolver,
    validUntil: options.validUntil,
    refund: options.refund,
  });
}, Action.withContext("hca.authorizeSession"));
