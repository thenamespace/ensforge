import { Array as Arr, String as Str } from "effect";
import { AsyncResult, Atom } from "effect/reactivity";

import type { Ensforge } from "@ensforge/sdk";

import { reactivity } from "./registry.js";
import { invalidationKeys, resultSubjects, type Subjects } from "./subjects.js";

/**
 * Also refreshes a read when a write touches a subject its latest value names (see
 * `resultSubjects`), on top of `subjects`, those in its options (left out here, so a write
 * refreshes it once). Apply it before `setIdleTTL`: like `withReactivity`, it is a transform,
 * which drops its source's idle TTL.
 *
 * @stability unstable
 */
export const followResults =
  (client: Ensforge.Client, path: string, subjects: Subjects) =>
  <atom extends Atom.Atom<AsyncResult.AsyncResult<unknown, unknown>>>(atom: atom): atom =>
    // `transform` returns a plain Atom of the result; callers keep the source atom's own type.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    Atom.transform(
      atom,
      (get) => {
        const service = AsyncResult.getOrThrow(get(reactivity));
        const scope = Str.startsWith("indexer.")(path) ? "indexer" : "chain";
        let unregister: (() => void) | undefined;
        const follow = (result: AsyncResult.AsyncResult<unknown, unknown>) => {
          if (!AsyncResult.isSuccess(result)) return result;
          const found = resultSubjects(result.value);
          const extra = {
            names: Arr.filter(found.names, (name) => !subjects.names.includes(name)),
            addresses: Arr.filter(
              found.addresses,
              (address) => !subjects.addresses.includes(address),
            ),
          };
          unregister?.();
          unregister = service.registerUnsafe(invalidationKeys(client, scope, extra), () =>
            get.refresh(atom),
          );
          return result;
        };

        get.addFinalizer(() => unregister?.());
        get.subscribe(atom, (result) => get.setSelf(follow(result)));
        return follow(get.once(atom));
      },
      { initialValueTarget: atom },
    ) as unknown as atom;
