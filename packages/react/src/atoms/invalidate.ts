import { Effect } from "effect";
import { AsyncResult, Atom, Reactivity, type AtomRegistry } from "effect/reactivity";

import type { Ensforge } from "@ensforge/sdk";

import { runtime } from "./runtime.js";
import { invalidationKeys, subjectsOf } from "./subjects.js";

/**
 * Refetches every cached read of the given names and accounts, chain and indexer reads alike.
 *
 * **When to use**
 *
 * Use after changes ensforge did not make, such as a transaction sent by another app. Writes
 * made through ensforge refresh their reads on their own.
 *
 * **Example** (Refreshing a name after an external change)
 *
 * ```ts
 * import { invalidate } from "@ensforge/react/atoms"
 *
 * invalidate(registry, ens, { names: ["alice.eth"] })
 * ```
 *
 * @category invalidation
 * @since 1.0.0
 */
// The registry's `Reactivity`, the one read atoms subscribe to.
const reactivity = runtime
  .atom(
    Effect.gen(function* () {
      return yield* Reactivity.Reactivity;
    }),
  )
  .pipe(Atom.keepAlive);

export const invalidate = (
  registry: AtomRegistry.AtomRegistry,
  client: Ensforge.Client,
  subjects: { readonly names?: readonly string[]; readonly addresses?: readonly string[] },
): void => {
  const resolved = subjectsOf({ names: subjects.names ?? [], address: subjects.addresses ?? [] });
  const service = AsyncResult.getOrThrow(registry.get(reactivity));

  service.invalidateUnsafe(invalidationKeys(client, "chain", resolved));
  service.invalidateUnsafe(invalidationKeys(client, "indexer", resolved));
};
