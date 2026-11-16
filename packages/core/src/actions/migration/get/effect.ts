import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import * as Action from "../../../internal/action/index.js";
import { inspectMigration, type ResolverChoice } from "../../../internal/migration/inspect.js";
import { requireAddress } from "../../../internal/name/write.js";
import type { get as Promises } from "./index.js";

/** @internal Implementation of `Actions.migration.get`. */
export const get = Effect.fn("ensforge.migration.get")(function* (
  client: Client,
  options: Promises.Options,
): Effect.fn.Return<Promises.ReturnType, Promises.ErrorType> {
  const account =
    options.account === undefined
      ? client.account
      : yield* requireAddress(options.account, "account");
  const resolver: ResolverChoice =
    options.resolver === undefined || ["new", "owned", "keep"].includes(options.resolver)
      ? (options.resolver as ResolverChoice)
      : yield* requireAddress(options.resolver, "resolver");

  const { status } = yield* inspectMigration(client, options.name, {
    account,
    resolver,
    ...(options.blockNumber === undefined
      ? { blockTag: options.blockTag }
      : { blockNumber: options.blockNumber }),
  });
  return status;
}, Action.withContext("migration.get"));
