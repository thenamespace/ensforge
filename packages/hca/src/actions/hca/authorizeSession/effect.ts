import { Effect } from "effect";

import {
  Action,
  addressOf,
  type AnyError,
  type Client,
  requireAddress,
  resolveSigner,
} from "@ensforge/sdk/extension";
import type { Address } from "viem";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import { authorize } from "../../../internal/session.js";
import type { authorizeSession as Promises } from "./index.js";

/** @internal Implementation of `Actions.hca.authorizeSession`. */
export const authorizeSession = Effect.fn("ensforge.hca.authorizeSession")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, AnyError | HcaError> {
  const sessionKey = yield* requireAddress(options.sessionKey, "sessionKey");
  const resolver = yield* requireAddress(options.resolver, "resolver");
  const signer = yield* resolveSigner(client, options.account);
  const owner = addressOf(signer.account) as Address;

  return yield* authorize(client, signer.walletClient, owner, {
    sessionKey,
    resolver,
    validUntil: options.validUntil,
    refund: options.refund,
  });
}, Action.withContext("hca.authorizeSession"));
