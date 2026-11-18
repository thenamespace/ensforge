import { Effect, Array as Arr, String as Str } from "effect";

import { Abis } from "@ensforge/contracts";

import type { Client } from "../../client/types.js";
import { MigrationError } from "../../errors/classes/MigrationError.js";
import type { AnyError } from "../../errors/types.js";
import { dnsDecode } from "../../utils/Name.js";
import { callIndexer } from "../indexer/call.js";
import { parseName } from "../name/normalize.js";
import * as Rpc from "../rpc/index.js";

// Recreating more subnames than this in one migration is better done with an explicit list.
const maxDiscovered = 500;

/**
 * The full name of a wrapped `[labelhash]` name, from the NameWrapper's own record of it; `null`
 * when it was never wrapped (the label stays unknown).
 */
const wrappedName = Effect.fnUntraced(function* (
  client: Client,
  name: string,
): Effect.fn.Return<string | null, AnyError> {
  const nameWrapper = client.deployment.v1?.contracts.nameWrapper;
  if (nameWrapper === undefined) return null;

  const { node } = yield* parseName(name);
  const dns = yield* Rpc.readContractOrUndefined(client, {
    address: nameWrapper,
    abi: Abis.v1.nameWrapper,
    functionName: "names",
    args: [node],
  });
  return dns === undefined || dns === "0x" ? null : dnsDecode(dns);
});

/**
 * The live subnames of `name` at every depth, from the client's indexer: `names` can be
 * recreated, `unknown` have labels known only by hash (the NameWrapper names the wrapped ones).
 * Only children the indexer counts subnames for are searched further. `null` without an indexer
 * or when the indexer does not know the name.
 */
export const discoverSubnames = Effect.fnUntraced(function* (
  client: Client,
  name: string,
): Effect.fn.Return<
  { readonly names: readonly string[]; readonly unknown: readonly string[] } | null,
  AnyError
> {
  if (client.config.indexer === undefined) return null;

  const names: string[] = [];
  const unknown: string[] = [];
  const parents = [name];
  for (let parent = parents.shift(); parent !== undefined; parent = parents.shift()) {
    let cursor: string | undefined;
    do {
      const page = yield* callIndexer(client, "getSubnames", {
        name: parent,
        namespace: "ens",
        includeExpired: false,
        limit: 200,
        cursor,
      }).pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)));
      if (page === null) {
        // Only the migrating name itself decides whether the indexer knows the tree.
        if (parent === name) return null;
        break;
      }

      // Lists can include children that no longer exist (unregistered in the ENSv1 registry).
      const live = Arr.filter(
        page.items,
        (child) => child.status === "active" || child.status === null,
      );
      const known = yield* Effect.forEach(
        live,
        (child) =>
          Str.includes("[")(child.name)
            ? wrappedName(client, child.name)
            : Effect.succeed(child.name),
        { concurrency: "unbounded" },
      );
      for (const [index, child] of live.entries()) {
        const full = known[index] ?? null;
        if (full === null) {
          unknown.push(child.name);
          continue;
        }
        names.push(full);
        // A count of `null` means the indexer does not say: look.
        if (child.subnameCount !== 0) parents.push(full);
      }
      if (names.length + unknown.length > maxDiscovered) {
        return yield* Effect.fail(
          new MigrationError({
            code: "NOT_ELIGIBLE",
            blockers: [`more than ${maxDiscovered} subnames`],
            context: { name },
            hint: "Pass the subnames to recreate in `subnames`, or `[]` to leave them behind.",
          }),
        );
      }
      cursor = page.hasMore ? (page.cursor ?? undefined) : undefined;
    } while (cursor !== undefined);
  }

  return { names, unknown };
});
