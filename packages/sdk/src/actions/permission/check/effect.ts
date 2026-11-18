import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { checkedAccount, checkName } from "../../../internal/permission/check.js";
import type { check as Promises } from "./index.js";

/** @internal Implementation of `Actions.permission.check`. */
export const check = Effect.fn("ensforge.permission.check")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, AnyError> {
  const account = yield* checkedAccount(client, options.account);
  const [result] = yield* checkName(client, options.name, account, [options.operation]);
  return result as Promises.ReturnType;
}, Action.withContext("permission.check"));
