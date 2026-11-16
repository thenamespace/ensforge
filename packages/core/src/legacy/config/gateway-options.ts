import { Schema } from "effect";

import { ConfigError } from "../errors/config-error.js";

const PositiveNumber = Schema.Number.check(Schema.isGreaterThan(0));

const NonNegativeInteger = Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)));

const GatewayOptionsSchema = Schema.Struct({
  allowedHosts: Schema.optional(Schema.Array(Schema.String)),
  deniedHosts: Schema.optional(Schema.Array(Schema.String)),
  timeout: Schema.optional(PositiveNumber),
  maxResponseSize: Schema.optional(PositiveNumber),
  maxRedirects: Schema.optional(NonNegativeInteger),
});

export interface GatewayOptions {
  readonly allowedHosts?: ReadonlyArray<string>;
  readonly deniedHosts?: ReadonlyArray<string>;
  readonly timeout?: number;
  readonly maxResponseSize?: number;
  readonly maxRedirects?: number;
}

export interface ResolvedGatewayOptions {
  readonly allowedHosts: ReadonlyArray<string> | null;
  readonly deniedHosts: ReadonlyArray<string>;
  readonly timeout: number;
  readonly maxResponseSize: number;
  readonly maxRedirects: number;
}

export const defaultGatewayOptions: ResolvedGatewayOptions = Object.freeze({
  allowedHosts: null,
  deniedHosts: Object.freeze([]),
  timeout: 10_000,
  maxResponseSize: 1_048_576,
  maxRedirects: 3,
});

export const resolveGatewayOptions = (
  options: GatewayOptions | undefined,
): ResolvedGatewayOptions => {
  if (options !== undefined && !Schema.is(GatewayOptionsSchema)(options)) {
    throw new ConfigError({
      code: "INVALID_GATEWAY_OPTIONS",
      message: "Gateway options contain an invalid policy value",
    });
  }

  return Object.freeze({
    allowedHosts:
      options?.allowedHosts === undefined ? null : Object.freeze([...options.allowedHosts]),
    deniedHosts: Object.freeze([...(options?.deniedHosts ?? [])]),
    timeout: options?.timeout ?? defaultGatewayOptions.timeout,
    maxResponseSize: options?.maxResponseSize ?? defaultGatewayOptions.maxResponseSize,
    maxRedirects: options?.maxRedirects ?? defaultGatewayOptions.maxRedirects,
  });
};
