import { Effect } from "effect";

import type { Client } from "../../../client/types.js";
import * as Action from "../../../internal/action/index.js";
import { inspectMigration, type ResolverChoice } from "../../../internal/migration/inspect.js";
import { recordInventory } from "../../../internal/migration/records.js";
import { discoverSubnames } from "../../../internal/migration/subnames.js";
import { requireAddress } from "../../../internal/name/write.js";
import { blockAt } from "../../../internal/rpc/block.js";
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
    ...blockAt(options),
  });
  if (status.status === "migrated" || status.status === "not-required") {
    return { ...status, discovered: null };
  }

  // The indexer reads the latest state, whatever block the inspection used.
  const locked = status.route === "wrapped-locked" || status.route === "locked-child";
  const copies = ["new", "owned", "public-v2"].includes(status.resolver.plan);
  const inventory = copies ? yield* recordInventory(client, status.name) : null;
  const subnames = locked ? null : yield* discoverSubnames(client, status.name);
  if (inventory === null && subnames === null) return { ...status, discovered: null };

  return {
    ...status,
    discovered: {
      records:
        inventory === null
          ? null
          : {
              keys: [
                ...inventory.texts.map((key) => `text:${key}`),
                ...inventory.addresses.map((coin) => `addr:${coin}`),
                ...(inventory.contentHash ? ["contenthash"] : []),
              ],
              skipped: inventory.skipped,
              complete: inventory.complete,
            },
      subnames: subnames === null ? null : [...subnames.names, ...subnames.unknown],
    },
  };
}, Action.withContext("migration.get"));
