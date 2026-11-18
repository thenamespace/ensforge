"use client";

import { useMemo, type ReactNode } from "react";

import { RegistryProvider } from "@effect/atom-react";

import type { Ensforge } from "@ensforge/sdk";

import type { Freshness } from "../atoms/read.js";
import { EnsforgeContext } from "./context.js";

/**
 * Props of {@link EnsforgeProvider}.
 *
 * @category provider
 * @since 1.0.0
 */
export type EnsforgeProviderProps = {
  /**
   * The client hooks use, as is: `Ensforge.create(…)`, or `Ensforge.fromWagmi(config)`. Writes
   * ENS makes on other chains (L2 primary names) need them in its `chains`, which `fromWagmi`
   * fills from the wagmi config's chains.
   */
  readonly client: Ensforge.Client;
  /** Freshness for every read below, unless a hook sets its own. */
  readonly defaults?: Freshness | undefined;
  /**
   * Create an atom registry for the subtree. Pass `false` when the app already renders a
   * `RegistryProvider` (to share atoms with it) or when nesting providers for other chains.
   *
   * @default true
   */
  readonly registry?: boolean | undefined;
  readonly children?: ReactNode;
};

/**
 * Provides an ensforge client to the hooks below it.
 *
 * **When to use**
 *
 * Use once near the root, inside the wagmi providers when the app has them. Nest another with
 * `registry={false}` for a second chain.
 *
 * **Details**
 *
 * - Hooks run actions with this client; they do not need its action groups (`extend`).
 * - It renders an Effect Atom `RegistryProvider`, so each server request gets its own cache.
 *
 * **Example** (A wagmi app)
 *
 * ```tsx
 * import { EnsforgeProvider } from "@ensforge/react"
 * import { Ensforge } from "@ensforge/sdk/wagmi"
 *
 * const ens = Ensforge.fromWagmi(wagmiConfig)
 *
 * export function Providers({ children }: { children: React.ReactNode }) {
 *   return <EnsforgeProvider client={ens}>{children}</EnsforgeProvider>
 * }
 * ```
 *
 * @category provider
 * @since 1.0.0
 */
export function EnsforgeProvider({
  client,
  defaults,
  registry = true,
  children,
}: EnsforgeProviderProps): ReactNode {
  const value = useMemo(() => ({ client, defaults: defaults ?? {} }), [client, defaults]);
  const provided = <EnsforgeContext.Provider value={value}>{children}</EnsforgeContext.Provider>;

  return registry ? <RegistryProvider>{provided}</RegistryProvider> : provided;
}
