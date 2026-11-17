import { Effect, Schema } from "effect";

import { IndexerError } from "../../errors/classes/IndexerError.js";
import type { NotFoundError } from "../../errors/classes/NotFoundError.js";
import type { Query } from "../../indexer/Indexer.js";
import type { Namespace } from "../../indexer/types.js";
import { capabilities } from "./capabilities.js";
import { send, type HttpConfig, type HttpRequest } from "./http.js";
import * as Convert from "./map.js";
import * as Params from "./params.js";
import type { CallContext, Implementation } from "./registry.js";
import * as Wire from "./wire.js";

/** Settings of a bigname-compatible REST indexer. */
export type RestOptions = {
  readonly id: string;
  /** Path prefix of the API version, e.g. `/v1`. */
  readonly version: string;
  /** Public hosts by chain ID, used when `url` is not given. */
  readonly hosts: Readonly<Record<number, string>>;
  readonly url?: string | undefined;
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly fetch?: typeof fetch | undefined;
  readonly timeout?: number | undefined;
  readonly retryCount?: number | undefined;
  readonly cache?: boolean | undefined;
  /** What the server supports beyond the shared routes. */
  readonly features: {
    /** `at` (snapshot tokens and times) on snapshot routes. */
    readonly snapshots: boolean;
    /** `safe` and `finalized` reads. */
    readonly finality: boolean;
    /** `GET /resolvers?role_holder=`; a server without the route reports it unsupported. */
    readonly resolversByRoleHolder: boolean;
  };
};

type Envelope = {
  readonly meta?: (typeof Wire.Meta)["Type"] | null | undefined;
  readonly page?: (typeof Wire.Page)["Type"] | null | undefined;
};

const baseUrlOf = (url: string, version: string): string => {
  const trimmed = url.replace(/\/+$/, "");
  return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}${version}`;
};

/** Not found as `null`, for single-resource reads. */
const orNull = <value, error>(effect: Effect.Effect<value, error | NotFoundError>) =>
  Effect.catchTag(effect as Effect.Effect<value, NotFoundError>, "NotFoundError", () =>
    Effect.succeed(null),
  ) as Effect.Effect<value | null, Exclude<error, NotFoundError>>;

/** An adapter for a server speaking bigname's REST API: bigname itself, Goldsky, a proxy. */
export const restIndexer = (options: RestOptions): Implementation => {
  const { id, features } = options;
  const cache: HttpConfig["cache"] = options.cache === true ? new Map() : undefined;
  const configs = new Map<number, HttpConfig>();
  const probes = new Map<number, ReturnType<typeof capabilities>>();

  const configFor = (chainId: number): Effect.Effect<HttpConfig, IndexerError> => {
    const known = configs.get(chainId);
    if (known !== undefined) return Effect.succeed(known);

    const url = options.url ?? options.hosts[chainId];
    if (url === undefined) {
      return Effect.fail(
        new IndexerError({
          code: "INDEXER_UNSUPPORTED",
          source: id,
          shortMessage: `${id} has no public host for chain ${chainId}.`,
          hint: `Pass \`url\` to ${id}() for a self-hosted or compatible server.`,
        }),
      );
    }
    const config: HttpConfig = {
      id,
      baseUrl: baseUrlOf(url, options.version),
      headers: options.headers ?? {},
      fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
      timeout: options.timeout ?? 15_000,
      retryCount: options.retryCount ?? 2,
      cache,
    };
    configs.set(chainId, config);
    probes.set(chainId, capabilities(config));
    return Effect.succeed(config);
  };

  const unsupported = (shortMessage: string) =>
    Effect.fail(new IndexerError({ code: "INDEXER_UNSUPPORTED", source: id, shortMessage }));

  const checkSnapshot = (query: Query.Snapshot) => {
    if (query.at !== undefined && !features.snapshots) {
      return unsupported(`${id} cannot read at a snapshot (\`at\`).`);
    }
    if (query.finality !== undefined && query.finality !== "latest" && !features.finality) {
      return unsupported(`${id} only reads the latest state (\`finality: "${query.finality}"\`).`);
    }
    return Effect.void;
  };

  /**
   * Resolves the HTTP config and the chain answers are read on. A namespaced query must be
   * served (its chain indexed); every query checks that the indexer serves ENS on the client's
   * chain.
   */
  const prepare = (context: CallContext, namespace: Namespace | undefined) =>
    Effect.gen(function* () {
      const config = yield* configFor(context.chainId);
      const probe = probes.get(context.chainId) as ReturnType<typeof capabilities>;
      const ensChain = yield* probe.serve("ens", context.chainId);
      const chainId =
        namespace === undefined || namespace === "ens"
          ? ensChain
          : yield* probe.serve(namespace, context.chainId);
      return { config, chainId };
    });

  const get = <S extends Schema.Constraint & { readonly DecodingServices: never }>(
    config: HttpConfig,
    schema: S,
    request: HttpRequest,
  ): Effect.Effect<S["Type"], IndexerError | NotFoundError> =>
    send(config, request).pipe(
      Effect.flatMap((body) => Wire.decode(schema, body, { id, route: request.route })),
    );

  // Mapping throws on malformed values (a non-decimal timestamp, a bad address).
  const mapped = <value>(route: string, evaluate: () => value) =>
    Effect.try({
      try: evaluate,
      catch: (cause) =>
        new IndexerError({ code: "INDEXER_RESPONSE_INVALID", route, source: id, cause }),
    });

  const pageOf = <item>(
    route: string,
    envelope: Envelope,
    rows: readonly unknown[],
    toItem: (row: never) => item,
    chainId: number,
  ) =>
    mapped(route, () =>
      Convert.page(
        envelope,
        rows.map((row) => toItem(row as never)),
        chainId,
        id,
      ),
    );

  const methods: Implementation["methods"] = {
    getName: (query, context) =>
      Effect.gen(function* () {
        yield* checkSnapshot(query);
        const { config, chainId } = yield* prepare(context, query.namespace);
        const route = "/names/{name}";
        const envelope = yield* get(config, Wire.envelope(Wire.NameRecord), {
          route,
          path: `/names/${encodeURIComponent(query.name)}`,
          query: { namespace: query.namespace, source: query.source, ...Params.snapshot(query) },
          resource: query.name,
        });
        return yield* mapped(route, () => ({
          ...Convert.detail(envelope.data),
          ...Convert.meta(envelope.meta, chainId, id),
        }));
      }).pipe(orNull),

    getNamesForAddress: (query, context) =>
      Effect.gen(function* () {
        const { config, chainId } = yield* prepare(context, query.namespace);
        const route = "/addresses/{address}/names";
        const envelope = yield* get(config, Wire.envelope(Schema.Array(Wire.AddressName)), {
          route,
          path: `/addresses/${query.address}/names`,
          query: Params.addressNames(query),
          resource: query.address,
        });
        return yield* pageOf(route, envelope, envelope.data, Convert.addressName, chainId);
      }),

    getSubnames: (query, context) =>
      Effect.gen(function* () {
        const { config, chainId } = yield* prepare(context, query.namespace);
        const route = "/names/{name}/subnames";
        const envelope = yield* get(config, Wire.envelope(Schema.Array(Wire.Subname)), {
          route,
          path: `/names/${encodeURIComponent(query.name)}/subnames`,
          query: Params.subnames(query),
          resource: query.name,
        });
        return yield* pageOf(route, envelope, envelope.data, Convert.subname, chainId);
      }),

    getHistory: (query, context) =>
      Effect.gen(function* () {
        const { config, chainId } = yield* prepare(context, query.namespace);
        const byName = query.name !== undefined;
        const route = byName ? "/names/{name}/history" : "/addresses/{address}/history";
        const envelope = yield* get(config, Wire.envelope(Schema.Array(Wire.HistoryEvent)), {
          route,
          path: byName
            ? `/names/${encodeURIComponent(query.name)}/history`
            : `/addresses/${query.address}/history`,
          query: Params.history(query),
          resource: query.name ?? query.address,
        });
        return yield* pageOf(route, envelope, envelope.data, Convert.event, chainId);
      }),

    getEvents: (query, context) =>
      Effect.gen(function* () {
        const { config, chainId } = yield* prepare(context, query.namespace);
        const route = "/events";
        const envelope = yield* get(config, Wire.envelope(Schema.Array(Wire.HistoryEvent)), {
          route,
          path: route,
          query: Params.events(query),
        });
        return yield* pageOf(
          route,
          envelope,
          envelope.data,
          (row: (typeof Wire.HistoryEvent)["Type"]) => Convert.event(row, query.name),
          chainId,
        );
      }),

    search: (query, context) =>
      Effect.gen(function* () {
        const { config, chainId } = yield* prepare(context, query.namespace);
        const route = "/search";
        const envelope = yield* get(config, Wire.envelope(Schema.Array(Wire.SearchName)), {
          route,
          path: route,
          query: {
            q: query.query,
            match: query.match,
            namespace: query.namespace,
            ...Params.paging(query),
          },
        });
        return yield* pageOf(route, envelope, envelope.data, Convert.name, chainId);
      }),

    lookup: (query, context) =>
      Effect.gen(function* () {
        const { config, chainId } = yield* prepare(context, query.namespace);
        const route = "/lookup";
        const envelope = yield* get(config, Wire.envelope(Schema.Array(Wire.LookupResult)), {
          route,
          path: route,
          body: Params.lookup(query),
        });
        return yield* mapped(route, () => ({
          results: envelope.data.map(Convert.lookupResult),
          ...Convert.meta(envelope.meta, chainId, id),
        }));
      }),

    getNamesByExpiry: (query, context) =>
      Effect.gen(function* () {
        const { config, chainId } = yield* prepare(context, query.namespace);
        const route = "/names";
        const envelope = yield* get(config, Wire.envelope(Schema.Array(Wire.SearchName)), {
          route,
          path: route,
          query: Params.expiry(query),
          repeat: ["expires_window", "grace_ends_window"],
        });
        return yield* pageOf(route, envelope, envelope.data, Convert.expiringName, chainId);
      }),

    getPrimaryName: (query, context) =>
      Effect.gen(function* () {
        const { config, chainId } = yield* prepare(context, query.namespace);
        const route = "/addresses/{address}/primary-name";
        const envelope = yield* get(config, Wire.envelope(Wire.PrimaryName), {
          route,
          path: `/addresses/${query.address}/primary-name`,
          query: {
            coin_type: query.coinType,
            namespace: query.namespace,
            source: query.source,
          },
          resource: query.address,
        });
        return yield* mapped(route, () => ({
          ...Convert.primaryName(envelope.data),
          ...Convert.meta(envelope.meta, chainId, id),
        }));
      }),

    getRecords: (query, context) =>
      Effect.gen(function* () {
        yield* checkSnapshot(query);
        const { config, chainId } = yield* prepare(context, query.namespace);
        const route =
          query.resolver === undefined
            ? "/names/{name}/records"
            : "/resolvers/{chain_id}/{address}/records";
        const envelope = yield* get(config, Wire.envelope(Wire.NameRecords), {
          route,
          path:
            query.resolver === undefined
              ? `/names/${encodeURIComponent(query.name)}/records`
              : `/resolvers/${query.resolver.chainId}/${query.resolver.address}/records`,
          query: Params.records(query),
          resource: query.name,
        });
        return yield* mapped(route, () => ({
          ...Convert.records(envelope.data),
          ...Convert.meta(envelope.meta, chainId, id),
        }));
      }).pipe(orNull),

    getPermissions: (query, context) =>
      Effect.gen(function* () {
        const { config, chainId } = yield* prepare(context, query.namespace);
        const route = "/permissions";
        const envelope = yield* get(config, Wire.envelope(Schema.Array(Wire.PermissionRow)), {
          route,
          path: route,
          query: Params.permissions(query),
        });
        return yield* pageOf(route, envelope, envelope.data, Convert.permission, chainId);
      }),

    getRegistry: (query, context) =>
      Effect.gen(function* () {
        yield* checkSnapshot(query);
        const { config } = yield* prepare(context, undefined);
        const route = "/registries/{chain_id}/{address}";
        const envelope = yield* get(config, Wire.envelope(Wire.RegistryOverview), {
          route,
          path: `/registries/${query.chainId}/${query.address}`,
          query: {
            include: query.includeCounts === true ? ["counts"] : undefined,
            ...Params.snapshot(query),
          },
          resource: query.address,
        });
        return yield* mapped(route, () => ({
          ...Convert.registry(envelope.data),
          ...Convert.meta(envelope.meta, query.chainId, id),
        }));
      }).pipe(orNull),

    getRegistryLabels: (query, context) =>
      Effect.gen(function* () {
        const { config } = yield* prepare(context, undefined);
        const route = "/registries/{chain_id}/{address}/labels";
        const envelope = yield* get(config, Wire.envelope(Schema.Array(Wire.RegistryLabel)), {
          route,
          path: `/registries/${query.chainId}/${query.address}/labels`,
          query: { owner: query.owner, exclude_owner: query.excludeOwner, ...Params.paging(query) },
          resource: query.address,
        });
        return yield* pageOf(route, envelope, envelope.data, Convert.registryLabel, query.chainId);
      }),

    getResolver: (query, context) =>
      Effect.gen(function* () {
        yield* checkSnapshot(query);
        const { config } = yield* prepare(context, undefined);
        const route = "/resolvers/{chain_id}/{address}";
        const envelope = yield* get(config, Wire.envelope(Wire.ResolverOverview), {
          route,
          path: `/resolvers/${query.chainId}/${query.address}`,
          query: { ...Params.snapshot(query), ...Params.paging(query) },
          resource: query.address,
        });
        return yield* mapped(route, () => ({
          ...Convert.resolver(envelope.data),
          ...Convert.meta(envelope.meta, query.chainId, id),
        }));
      }).pipe(orNull),

    getResolverLinks: (query, context) =>
      Effect.gen(function* () {
        yield* checkSnapshot(query);
        const { config } = yield* prepare(context, undefined);
        const route = "/resolvers/{chain_id}/{address}/links";
        const envelope = yield* get(config, Wire.envelope(Schema.Array(Wire.ResolverLink)), {
          route,
          path: `/resolvers/${query.chainId}/${query.address}/links`,
          query: { ...Params.snapshot(query), ...Params.paging(query) },
          resource: query.address,
        });
        return yield* pageOf(route, envelope, envelope.data, Convert.resolverLink, query.chainId);
      }),

    getResolverRoles: (query, context) =>
      Effect.gen(function* () {
        yield* checkSnapshot(query);
        const { config } = yield* prepare(context, undefined);
        const route = "/resolvers/{chain_id}/{address}/roles";
        const envelope = yield* get(config, Wire.envelope(Schema.Array(Wire.ResolverRole)), {
          route,
          path: `/resolvers/${query.chainId}/${query.address}/roles`,
          query: { ...Params.snapshot(query), ...Params.paging(query) },
          resource: query.address,
        });
        return yield* pageOf(route, envelope, envelope.data, Convert.resolverRole, query.chainId);
      }),

    ...(features.resolversByRoleHolder
      ? {
          getResolvers: (query: Query.GetResolvers, context: CallContext) =>
            Effect.gen(function* () {
              const { config, chainId } = yield* prepare(context, undefined);
              const route = "/resolvers";
              const envelope = yield* get(
                config,
                Wire.envelope(Schema.Array(Wire.RoleHolderResolver)),
                {
                  route,
                  path: route,
                  query: {
                    role_holder: query.roleHolder,
                    chain_id: query.chainId,
                    ...Params.paging(query),
                  },
                },
              ).pipe(
                // A list route answers an empty page for no matches; a 404 means the server
                // predates the route (bigname before v0.14), so it does not support the query.
                Effect.catchTag("NotFoundError", () =>
                  Effect.fail(
                    new IndexerError({
                      code: "INDEXER_UNSUPPORTED",
                      source: id,
                      shortMessage: `${id} does not serve resolvers by role holder (GET ${route}).`,
                    }),
                  ),
                ),
              );
              return yield* pageOf(
                route,
                envelope,
                envelope.data,
                Convert.roleHolderResolver,
                chainId,
              );
            }),
        }
      : {}),

    getNamespace: (query, context) =>
      Effect.gen(function* () {
        const config = yield* configFor(context.chainId);
        const route = "/namespaces/{namespace}";
        const envelope = yield* get(config, Wire.envelope(Wire.Namespace), {
          route,
          path: `/namespaces/${query.namespace}`,
          resource: query.namespace,
        });
        return yield* mapped(route, () => ({
          ...Convert.namespace(envelope.data),
          ...Convert.meta(envelope.meta, context.chainId, id),
        }));
      }).pipe(orNull),

    getStatus: (_query, context) =>
      Effect.gen(function* () {
        const config = yield* configFor(context.chainId);
        const route = "/status";
        const envelope = yield* get(config, Wire.envelope(Wire.StatusData), { route, path: route });
        return yield* mapped(route, () => Convert.status(envelope.data, id));
      }),
  };

  return { id, methods };
};
