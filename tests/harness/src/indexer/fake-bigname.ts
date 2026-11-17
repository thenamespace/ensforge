import { bigname as bignameFixtures } from "./fixtures/bigname.js";
import { goldsky as goldskyFixtures } from "./fixtures/goldsky.js";
import type { Envelope, ErrorEnvelope } from "./fixtures/types.js";
import { match, type FakeRequest, type Fixtures, type Route } from "./routes.js";

/** What the fake sends back for one request. */
export type Reply =
  | {
      readonly kind: "http";
      readonly status: number;
      /** Raw body text; JSON replies are serialized by `reply.json`. */
      readonly text: string;
      readonly headers: Readonly<Record<string, string>>;
    }
  /** Never answers; rejects with the abort reason once the request's signal aborts. */
  | { readonly kind: "hang" }
  /** `fetch` rejects, as on a DNS failure or a reset connection. */
  | { readonly kind: "network"; readonly message: string };

/** A reply, or `undefined` to fall through to the fixtures. */
export type Responder = Reply | ((request: FakeRequest) => Reply | undefined);

/** A request and what the fake answered (`undefined` for hangs and network failures). */
export type Recorded = FakeRequest & { readonly status: number | undefined };

const http = (status: number, text: string, headers: Readonly<Record<string, string>> = {}) =>
  ({ kind: "http", status, text, headers }) as const satisfies Reply;

/** Reply builders for `on` and `once`. */
export const reply = {
  json: (body: unknown, status = 200, headers: Readonly<Record<string, string>> = {}): Reply =>
    http(status, JSON.stringify(body), { "content-type": "application/json", ...headers }),
  envelope: (envelope: Envelope, headers?: Readonly<Record<string, string>>): Reply =>
    reply.json(envelope, 200, headers),
  /** bigname's error envelope, e.g. `error(503, "overloaded")`. */
  error: (
    status: number,
    code?: string,
    message = `fake ${status}`,
    headers?: Readonly<Record<string, string>>,
  ): Reply =>
    code === undefined
      ? http(status, "", headers)
      : reply.json(
          { error: { code, message, details: {} } } satisfies ErrorEnvelope,
          status,
          headers,
        ),
  /** `429 rate_limited`, with `Retry-After` when given (seconds or an HTTP date). */
  rateLimited: (retryAfter?: string): Reply =>
    reply.error(
      429,
      "rate_limited",
      "Too many requests.",
      retryAfter === undefined ? {} : { "retry-after": retryAfter },
    ),
  /** A body that is not JSON, with any status. */
  text: (text: string, status = 200): Reply => http(status, text, { "content-type": "text/plain" }),
  hang: (): Reply => ({ kind: "hang" }),
  network: (message = "fetch failed"): Reply => ({ kind: "network", message }),
} as const;

export type FakeIndexerOptions = {
  /** Version prefix the server serves, e.g. `/v1`. */
  readonly version: string;
  /** Answers by route; merged over the defaults of `fakeBigname` / `fakeGoldsky`. */
  readonly fixtures?: Fixtures | undefined;
  /** Routes the server lacks: answered with a bare `404`, as a minimal compatible server does. */
  readonly without?: readonly Route[] | undefined;
  /** Send ETags and answer `If-None-Match` with `304`. */
  readonly etag?: boolean | undefined;
  /** Origin of the fake. @default "https://indexer.fake" */
  readonly origin?: string | undefined;
};

export type FakeIndexer = {
  /** Origin to pass as the indexer's `url`; the indexer adds the version prefix. */
  readonly url: string;
  /** The `fetch` to pass to `bigname({ fetch })` / `goldsky({ fetch })`. */
  readonly fetch: typeof fetch;
  /** Every request, in order. */
  readonly requests: readonly Recorded[];
  /** Requests to one route. */
  readonly requestsTo: (route: Route) => readonly Recorded[];
  /** Answers `route` with `responder` from now on (before the fixtures). */
  readonly on: (route: Route | "*", responder: Responder) => void;
  /** Answers the next requests to `route` with `replies`, one each, before anything else. */
  readonly once: (route: Route | "*", ...replies: readonly Reply[]) => void;
};

// FNV-1a, enough for a stable fake ETag.
const etagOf = (text: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
  }
  return `"${hash.toString(16)}"`;
};

/**
 * An in-memory bigname-compatible REST server, as a `fetch` implementation. It serves `fixtures`
 * by route, injects failures with `on`/`once`, and records each request.
 */
export const fakeIndexer = (options: FakeIndexerOptions): FakeIndexer => {
  const origin = options.origin ?? "https://indexer.fake";
  const prefix = `${origin}${options.version}`;
  const without = new Set<Route>(options.without ?? []);
  const fixtures = options.fixtures ?? {};
  const requests: Recorded[] = [];
  const persistent = new Map<Route | "*", Responder>();
  const queued = new Map<Route | "*", Reply[]>();

  const fromFixtures = (request: FakeRequest): Reply => {
    if (request.route === undefined || without.has(request.route)) return reply.error(404);
    if (request.route === "/lookup" ? request.method !== "POST" : request.method !== "GET") {
      return reply.error(405, "invalid_input", "Method not allowed.");
    }

    const envelope = fixtures[request.route]?.(request);
    return envelope === undefined
      ? reply.error(404, "not_found", `No record of ${request.path}.`)
      : reply.envelope(envelope);
  };

  const answer = (request: FakeRequest): Reply => {
    for (const key of [request.route, "*"] as const) {
      if (key === undefined) continue;
      const next = queued.get(key)?.shift();
      if (next !== undefined) return next;
    }
    for (const key of [request.route, "*"] as const) {
      const responder = key === undefined ? undefined : persistent.get(key);
      const result = typeof responder === "function" ? responder(request) : responder;
      if (result !== undefined) return result;
    }
    return fromFixtures(request);
  };

  const respond = (request: FakeRequest, result: Extract<Reply, { kind: "http" }>) => {
    if (options.etag !== true || result.status !== 200 || request.method !== "GET") {
      return new Response(result.text === "" ? null : result.text, {
        status: result.status,
        headers: result.headers,
      });
    }

    const etag = etagOf(result.text);
    return request.headers["if-none-match"] === etag
      ? new Response(null, { status: 304, headers: { etag } })
      : new Response(result.text, { status: 200, headers: { ...result.headers, etag } });
  };

  const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input : input.url,
    );
    const href = url.href;
    const path = href.startsWith(prefix)
      ? url.pathname.slice(options.version.length)
      : url.pathname;
    const matched = href.startsWith(prefix) ? match(path) : undefined;
    const request: FakeRequest = {
      method: init?.method ?? "GET",
      url: href,
      path,
      route: matched?.route,
      params: matched?.params ?? {},
      query: url.searchParams,
      // `Headers` lowercases names.
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      signal: init?.signal ?? undefined,
    };

    const result = answer(request);
    if (result.kind !== "http") {
      requests.push({ ...request, status: undefined });
      if (result.kind === "hang") {
        return new Promise<Response>((_, reject) => {
          request.signal?.addEventListener("abort", () => reject(request.signal?.reason), {
            once: true,
          });
        });
      }
      throw new TypeError(result.message);
    }

    const response = respond(request, result);
    requests.push({ ...request, status: response.status });
    return response;
  };

  return {
    url: origin,
    fetch: fakeFetch as typeof fetch,
    requests,
    requestsTo: (route) => requests.filter((request) => request.route === route),
    on: (route, responder) => {
      persistent.set(route, responder);
    },
    once: (route, ...replies) => {
      queued.set(route, [...(queued.get(route) ?? []), ...replies]);
    },
  };
};

/** A fake bigname (`/v1`) serving the recorded mainnet fixtures. */
export const fakeBigname = (options: Partial<FakeIndexerOptions> = {}): FakeIndexer =>
  fakeIndexer({
    version: "/v1",
    origin: "https://bigname.fake",
    ...options,
    fixtures: { ...bignameFixtures, ...options.fixtures },
  });

/** A fake Goldsky (`/v2`, no `/resolvers`) serving ENS on mainnet and Basenames on Base. */
export const fakeGoldsky = (options: Partial<FakeIndexerOptions> = {}): FakeIndexer =>
  fakeIndexer({
    version: "/v2",
    origin: "https://goldsky.fake",
    ...options,
    without: ["/resolvers", ...(options.without ?? [])],
    fixtures: { ...goldskyFixtures, ...options.fixtures },
  });
