import { Array as Arr, String as Str } from "effect";

import type { Envelope } from "./fixtures/types.js";

/** Every route of bigname's REST API, below the version prefix. Goldsky serves all but `/resolvers`. */
export const routes = [
  "/status",
  "/namespaces/{namespace}",
  "/names",
  "/names/{name}",
  "/names/{name}/subnames",
  "/names/{name}/history",
  "/names/{name}/records",
  "/addresses/{address}/names",
  "/addresses/{address}/history",
  "/addresses/{address}/primary-name",
  "/events",
  "/search",
  "/lookup",
  "/permissions",
  "/registries/{chain_id}/{address}",
  "/registries/{chain_id}/{address}/labels",
  "/resolvers",
  "/resolvers/{chain_id}/{address}",
  "/resolvers/{chain_id}/{address}/links",
  "/resolvers/{chain_id}/{address}/records",
  "/resolvers/{chain_id}/{address}/roles",
] as const;

export type Route = (typeof routes)[number];

/** One request the fake indexer received. */
export type FakeRequest = {
  readonly method: string;
  readonly url: string;
  /** Path below the version prefix, e.g. `/names/nick.eth`. */
  readonly path: string;
  /** The matched route template; `undefined` for unknown paths. */
  readonly route: Route | undefined;
  /** Decoded path parameters, e.g. `{ name: "nick.eth" }`. */
  readonly params: Readonly<Record<string, string>>;
  readonly query: URLSearchParams;
  /** Lowercased header names. */
  readonly headers: Readonly<Record<string, string>>;
  /** Parsed JSON body of a POST. */
  readonly body: unknown;
  readonly signal: AbortSignal | undefined;
};

/** Recorded fixtures by route: an envelope, or `undefined` for a `404 not_found`. */
export type Fixtures = {
  readonly [route in Route]?: (request: FakeRequest) => Envelope | undefined;
};

/** The route template `path` matches, with its decoded parameters. */
export const match = (
  path: string,
): { readonly route: Route; readonly params: Record<string, string> } | undefined => {
  const segments = Str.split(path, "/").slice(1);
  for (const route of routes) {
    const template = Str.split(route, "/").slice(1);
    if (template.length !== segments.length) continue;

    const params: Record<string, string> = {};
    const matches = Arr.every(template, (part, index) => {
      const segment = segments[index] ?? "";
      if (!Str.startsWith("{")(part)) return part === segment;
      params[Str.slice(1, -1)(part)] = decodeURIComponent(segment);
      return segment !== "";
    });
    if (matches) return { route, params };
  }
  return undefined;
};
