import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { ContractError } from "../../../errors/contract-error.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { executeResolveCall } from "./execute.js";
import type {
  ResolveError,
  ResolveParameters,
  ResolveResult,
  ResolveWithResolverError,
  ResolveWithResolverParameters,
  ResolveWithResolverResult,
} from "./types.js";

const resolveEffect = Effect.fn("ensforge.resolve")(function* (
  config: EnsforgeConfig,
  parameters: ResolveParameters,
) {
  return yield* executeRead(config, parameters, executeResolveCall(parameters, config.gateways));
});

const resolveWithResolverEffect = Effect.fn("ensforge.resolveWithResolver")(function* (
  config: EnsforgeConfig,
  parameters: ResolveWithResolverParameters,
) {
  const result = yield* executeRead(
    config,
    parameters,
    executeResolveCall(parameters, config.gateways),
  );

  return result === null
    ? yield* new ContractError({
        code: "DECODE_FAILED",
        message: "Resolution with an explicit resolver returned no result",
        cause: { name: parameters.name, resolverAddress: parameters.resolverAddress },
      })
    : result;
});

export const resolve = defineReadAction<ResolveParameters, ResolveResult, ResolveError>(
  resolveEffect,
);

export const resolveWithResolver = defineReadAction<
  ResolveWithResolverParameters,
  ResolveWithResolverResult,
  ResolveWithResolverError
>(resolveWithResolverEffect);

export {
  ResolveResult,
  ResolveWithResolverResult,
  type ResolveError,
  type ResolveParameters,
  type ResolveWithResolverError,
  type ResolveWithResolverParameters,
} from "./types.js";
