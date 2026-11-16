import { Schema } from "effect";

import { ConfigError } from "../errors/config-error.js";
import type { EnsNetwork, EnsNetworkId } from "./network.js";

export type IndexerProtocol = "v1" | "v2";

export type IndexerFailureMode = "strict" | "partial";

export interface IndexerSourceContext {
  readonly network: EnsNetworkId;
  readonly protocol: IndexerProtocol;
}

export type IndexerHeaderValues = Readonly<Record<string, string>>;

export type IndexerHeaders =
  | IndexerHeaderValues
  | ((source: IndexerSourceContext) => IndexerHeaderValues | Promise<IndexerHeaderValues>);

export interface IndexerEndpoints {
  readonly v1?: string | null;
  readonly v2?: string | null;
}

export interface IndexerRetryPolicy {
  /** Number of retries after the initial request. */
  readonly attempts?: number;
}

export interface IndexerRequestPolicy {
  readonly timeout?: number;
  readonly retry?: IndexerRetryPolicy;
}

export interface IndexerConfig extends IndexerRequestPolicy {
  readonly enabled?: boolean;
  readonly endpoints?: IndexerEndpoints;
  readonly headers?: IndexerHeaders;
  readonly fetch?: typeof globalThis.fetch;
  readonly failureMode?: IndexerFailureMode;
  readonly maximumPageSize?: number;
}

export interface ResolvedIndexerEndpoints {
  readonly v1: string | null;
  readonly v2: string | null;
}

export interface ResolvedIndexerConfig {
  readonly enabled: boolean;
  readonly endpoints: ResolvedIndexerEndpoints;
  readonly timeout: number;
  readonly retry: Readonly<{ readonly attempts: number }>;
  readonly failureMode: IndexerFailureMode;
  readonly maximumPageSize: number;
}

export type IndexerSourceState = "enabled" | "disabled" | "unavailable";

export const defaultIndexerEndpoints = Object.freeze({
  mainnet: Object.freeze({
    v1: "https://api.thegraph.com/subgraphs/name/ensdomains/ens",
    v2: null,
  }),
  sepolia: Object.freeze({
    v1: "https://api.studio.thegraph.com/query/49574/enssepolia/version/latest",
    v2: "https://staging-graphql.ens.dev/graphql",
  }),
}) satisfies Readonly<Record<EnsNetwork, ResolvedIndexerEndpoints>>;

export const defaultIndexerRequestPolicy = Object.freeze({
  timeout: 15_000,
  retry: Object.freeze({ attempts: 2 }),
  failureMode: "strict" as const,
  maximumPageSize: 100,
});

interface IndexerRuntimeConfig {
  readonly headers?: IndexerHeaders;
  readonly fetch?: typeof globalThis.fetch;
  readonly sourceStates: Readonly<Record<IndexerProtocol, IndexerSourceState>>;
}

const runtimeConfigs = new WeakMap<ResolvedIndexerConfig, IndexerRuntimeConfig>();

const endpointSchema = Schema.Union([Schema.String, Schema.Null]);

const nonNegativeInteger = Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)));

const positiveInteger = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)));

const validateEndpoint = (endpoint: string | null, protocol: IndexerProtocol): void => {
  if (endpoint === null) return;

  let url: URL;

  try {
    url = new URL(endpoint);
  } catch {
    throw new ConfigError({
      code: "INVALID_INDEXER_OPTIONS",
      message: `The ${protocol} indexer endpoint must be a valid HTTP URL`,
    });
  }

  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
    throw new ConfigError({
      code: "INVALID_INDEXER_OPTIONS",
      message: `The ${protocol} indexer endpoint must use HTTP and must not contain credentials`,
    });
  }
};

export const resolveIndexerConfig = (
  network: EnsNetwork | undefined,
  config: IndexerConfig | false | undefined,
): ResolvedIndexerConfig => {
  if (config !== undefined && config !== false && (typeof config !== "object" || config === null)) {
    throw new ConfigError({
      code: "INVALID_INDEXER_OPTIONS",
      message: "Indexer configuration must be an options object, false, or omitted",
    });
  }

  const options = config === false ? { enabled: false } : (config ?? {});

  if (
    (options.enabled !== undefined && typeof options.enabled !== "boolean") ||
    (options.endpoints !== undefined &&
      (typeof options.endpoints !== "object" || options.endpoints === null)) ||
    (options.retry !== undefined && (typeof options.retry !== "object" || options.retry === null))
  ) {
    throw new ConfigError({
      code: "INVALID_INDEXER_OPTIONS",
      message: "Indexer options contain an invalid policy value",
    });
  }

  const defaults =
    network === undefined ? { v1: null, v2: null } : defaultIndexerEndpoints[network];

  const endpoints = {
    v1: options.endpoints?.v1 === undefined ? defaults.v1 : options.endpoints.v1,
    v2: options.endpoints?.v2 === undefined ? defaults.v2 : options.endpoints.v2,
  };

  if (!Schema.is(endpointSchema)(endpoints.v1) || !Schema.is(endpointSchema)(endpoints.v2)) {
    throw new ConfigError({
      code: "INVALID_INDEXER_OPTIONS",
      message: "Indexer endpoints must be URLs, null, or omitted",
    });
  }

  validateEndpoint(endpoints.v1, "v1");
  validateEndpoint(endpoints.v2, "v2");

  const timeout = options.timeout ?? defaultIndexerRequestPolicy.timeout;
  const attempts = options.retry?.attempts ?? defaultIndexerRequestPolicy.retry.attempts;
  const maximumPageSize = options.maximumPageSize ?? defaultIndexerRequestPolicy.maximumPageSize;
  const failureMode = options.failureMode ?? defaultIndexerRequestPolicy.failureMode;

  if (
    !Schema.is(positiveInteger)(timeout) ||
    !Schema.is(nonNegativeInteger)(attempts) ||
    !Schema.is(positiveInteger)(maximumPageSize) ||
    (failureMode !== "strict" && failureMode !== "partial") ||
    (options.headers !== undefined &&
      typeof options.headers !== "function" &&
      (typeof options.headers !== "object" ||
        options.headers === null ||
        Object.values(options.headers).some((value) => typeof value !== "string"))) ||
    (options.fetch !== undefined && typeof options.fetch !== "function")
  ) {
    throw new ConfigError({
      code: "INVALID_INDEXER_OPTIONS",
      message: "Indexer options contain an invalid policy value",
    });
  }

  const enabled =
    options.enabled ?? (network !== undefined || endpoints.v1 !== null || endpoints.v2 !== null);

  const resolved = Object.freeze({
    enabled,
    endpoints: Object.freeze(endpoints),
    timeout,
    retry: Object.freeze({ attempts }),
    failureMode,
    maximumPageSize,
  });

  const sourceStates = Object.freeze({
    v1:
      !enabled || options.endpoints?.v1 === null
        ? ("disabled" as const)
        : endpoints.v1 === null
          ? ("unavailable" as const)
          : ("enabled" as const),
    v2:
      !enabled || options.endpoints?.v2 === null
        ? ("disabled" as const)
        : endpoints.v2 === null
          ? ("unavailable" as const)
          : ("enabled" as const),
  });

  runtimeConfigs.set(resolved, {
    sourceStates,
    ...(options.headers === undefined ? {} : { headers: options.headers }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });

  return resolved;
};

export const getIndexerRuntimeConfig = (config: ResolvedIndexerConfig): IndexerRuntimeConfig =>
  runtimeConfigs.get(config) ?? {
    sourceStates: Object.freeze({
      v1: config.endpoints.v1 === null ? "unavailable" : "enabled",
      v2: config.endpoints.v2 === null ? "unavailable" : "enabled",
    }),
  };
