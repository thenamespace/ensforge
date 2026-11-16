import { Effect } from "effect";

import { defineAction } from "../../../action/action.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { WritePlanError } from "../../../errors/write-plan-error.js";
import { namehash } from "../../../names/hashes.js";
import { normalizeName } from "../../../names/normalize.js";
import { getResolverCapabilities } from "../../capabilities/get-resolver-capabilities/index.js";
import { getProtocol } from "../../name/get-protocol/index.js";
import { createResolver } from "../create-resolver/index.js";
import type {
  GetOrCreateResolverError,
  GetOrCreateResolverParameters,
  GetOrCreateResolverResult,
} from "./types.js";

const implementation = Effect.fn("ensforge.getOrCreateResolver")(function* (
  config: EnsforgeConfig,
  parameters: GetOrCreateResolverParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  const [protocol, capabilities] = yield* Effect.all(
    [
      getProtocol.effect(config, { name }),
      getResolverCapabilities.effect(config, { name }),
    ] as const,
    { concurrency: "unbounded" },
  );

  const compatible =
    capabilities.address !== null &&
    !capabilities.inherited &&
    capabilities.authorization !== "none" &&
    capabilities.authorization !== "unknown";

  if (compatible && capabilities.address !== null) {
    return {
      status: "existing",
      protocol,
      resolver: capabilities.address,
      inherited: false,
    } as const satisfies GetOrCreateResolverResult;
  }

  if (protocol === "v1") {
    const deployment = config.deployments.v1;

    if (deployment === undefined) {
      return yield* new WritePlanError({
        code: "INVALID_CALL_PLAN",
        message: "The active deployment does not include an ENSv1 Public Resolver",
        cause: config.deployments,
      });
    }

    return {
      status: "selected",
      protocol: "v1",
      resolver: deployment.contracts.publicResolver,
      inherited: false,
    } as const satisfies GetOrCreateResolverResult;
  }

  const created = yield* createResolver.effect(config, {
    salt: parameters.salt ?? BigInt(namehash(name)),
    ...(parameters.admin === undefined ? {} : { admin: parameters.admin }),
    ...(parameters.roles === undefined ? {} : { roles: parameters.roles }),
    ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
    ...(parameters.account === undefined ? {} : { account: parameters.account }),
    ...(parameters.confirmation === undefined ? {} : { confirmation: parameters.confirmation }),
  });

  return {
    ...created,
    protocol: "v2",
    inherited: false,
  } as const satisfies GetOrCreateResolverResult;
});

export const getOrCreateResolver = defineAction<
  GetOrCreateResolverParameters,
  GetOrCreateResolverResult,
  GetOrCreateResolverError
>(implementation);

export type {
  GetOrCreateResolverError,
  GetOrCreateResolverParameters,
  GetOrCreateResolverResult,
} from "./types.js";
