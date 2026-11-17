"use client";

import { createContext, useContext } from "react";

import type { Ensforge } from "@ensforge/sdk";

import type { Freshness } from "../atoms/read.js";

/** What `EnsforgeProvider` gives the hooks below it. */
export type EnsforgeContextValue = {
  readonly client: Ensforge.Client;
  readonly defaults: Freshness;
};

export const EnsforgeContext = createContext<EnsforgeContextValue | undefined>(undefined);

/** The nearest provider's client and defaults; `client` overrides the client. */
export const useEnsforgeContext = (client?: Ensforge.Client): EnsforgeContextValue => {
  const context = useContext(EnsforgeContext);
  if (client !== undefined) return { client, defaults: context?.defaults ?? {} };
  if (context === undefined) {
    throw new Error(
      "ensforge hooks need an <EnsforgeProvider client={…}> above them, or a `client` option.",
    );
  }
  return context;
};

/**
 * The client of the nearest `EnsforgeProvider`.
 *
 * **Example** (Calling an action from an event handler)
 *
 * ```tsx
 * import { Actions } from "@ensforge/sdk"
 * import { useEnsforge } from "@ensforge/react"
 *
 * function Check({ name }: { name: string }) {
 *   const ens = useEnsforge()
 *   return <button onClick={() => Actions.registration.isAvailable(ens, { name })}>Check</button>
 * }
 * ```
 *
 * @category provider
 * @since 1.0.0
 */
export const useEnsforge = (): Ensforge.Client => useEnsforgeContext().client;
