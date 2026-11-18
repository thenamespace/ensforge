import { Effect } from "effect";
import { AtomRegistry } from "effect/reactivity";

import type { Ensforge } from "@ensforge/sdk";

import { ensAtom, type Freshness } from "../atoms/read.js";
import { serverReads } from "../atoms/runtime.js";
import type { Action, ActionOptions } from "../atoms/types.js";

/**
 * Runs a read on the server into `registry`, so `dehydrate` can send its result to the client.
 *
 * **When to use**
 *
 * Use in server components, loaders and `getServerSideProps`/`getStaticProps` for the reads a
 * page renders first. Reads that are not prefetched render as loading on the server and run in
 * the browser.
 *
 * **Details**
 *
 * - Resolves once the read settles; a failed read is not sent, so the browser retries it.
 * - Do not await it when streaming (`dehydrate(registry, { streaming: true })`): pending reads
 *   then stream to the client as they resolve.
 * - Use a new registry per request.
 *
 * **Example** (Next.js App Router)
 *
 * ```tsx
 * import { Actions } from "@ensforge/sdk"
 * import { HydrationBoundary } from "@ensforge/react"
 * import { dehydrate, prefetch } from "@ensforge/react/server"
 * import { AtomRegistry } from "effect/reactivity"
 *
 * export default async function Page({ params }: { params: { name: string } }) {
 *   const registry = AtomRegistry.make()
 *   await prefetch(registry, ens, Actions.name.get, { name: params.name })
 *   return <HydrationBoundary state={dehydrate(registry)}>{params.name}</HydrationBoundary>
 * }
 * ```
 *
 * @stability unstable
 * @category server
 * @since 1.0.0
 */
export const prefetch = <action extends Action>(
  registry: AtomRegistry.AtomRegistry,
  client: Ensforge.Client,
  action: action,
  options: ActionOptions<action>,
  freshness?: Freshness,
): Promise<void> => {
  registry.set(serverReads, true);
  const atom = ensAtom(client, action, options, freshness);
  // Kept mounted until the registry is disposed, so `dehydrate` still finds it.
  registry.mount(atom);

  return Effect.runPromise(
    AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true }).pipe(Effect.ignore),
  );
};
