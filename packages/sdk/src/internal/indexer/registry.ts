import type { Effect } from "effect";

import type { AnyError } from "../../errors/types.js";
import type { Indexer, Method, Methods } from "../../indexer/Indexer.js";

/** What an adapter method receives besides its query. */
export type CallContext = {
  /** Chain of the ensforge client. */
  readonly chainId: number;
};

/** One adapter method as an Effect. */
export type EffectMethod<method extends Method> = (
  query: Parameters<Methods[method]>[0],
  context: CallContext,
) => Effect.Effect<ReturnType<Methods[method]>, AnyError>;

/** An adapter's methods as Effects; a missing method is an unsupported query. */
export type Implementation = {
  readonly id: string;
  readonly methods: { readonly [method in Method]?: EffectMethod<method> };
};

/** Every adapter method, in a stable order. */
export const methodNames: readonly Method[] = [
  "getName",
  "getNamesForAddress",
  "getSubnames",
  "getHistory",
  "getEvents",
  "search",
  "lookup",
  "getNamesByExpiry",
  "getPrimaryName",
  "getRecords",
  "getPermissions",
  "getRegistry",
  "getRegistryLabels",
  "getResolver",
  "getResolverLinks",
  "getResolverRoles",
  "getResolvers",
  "getNamespace",
  "getStatus",
];

// Public `Indexer` values are opaque handles, so their types stay free of Effect.
const implementations = new WeakMap<Indexer, Implementation>();

/** Wraps an implementation in the public, opaque `Indexer` handle. */
export const makeIndexer = (implementation: Implementation): Indexer => {
  const indexer: Indexer = Object.freeze({
    id: implementation.id,
    "~ensforge/indexer": true as const,
  });
  implementations.set(indexer, implementation);
  return indexer;
};

/** The implementation behind a handle; `undefined` for values not built by ensforge. */
export const implementationOf = (indexer: Indexer): Implementation | undefined =>
  implementations.get(indexer);
