import { Layer } from "effect";
import { Atom } from "effect/reactivity";

/** The atom runtime every ensforge atom runs in; it carries the registry's `Reactivity`. */
export const runtime = Atom.runtime(Layer.empty);

/**
 * `true` in registries that may run reads on the server: `prefetch` sets it. Server renders of
 * reads that were not prefetched stay loading instead of fanning out RPC calls.
 */
export const serverReads = Atom.make(false).pipe(Atom.keepAlive);

export const isServer = typeof (globalThis as { readonly window?: unknown }).window === "undefined";
