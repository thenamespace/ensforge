import { Effect } from "effect";

import { versionableResolverAbi } from "@ensforge/contracts/shared";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import { findResolver } from "../get-resolver/find.js";
import type {
  GetResolverVersionError,
  GetResolverVersionParameters,
  ResolverVersionResult,
} from "./types.js";

const getResolverVersionEffect = Effect.fn("ensforge.getResolverVersion")(function* (
  config: EnsforgeConfig,
  parameters: GetResolverVersionParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const discovery = yield* findResolver(name);

      if (discovery === null) {
        return {
          supported: false,
          name,
          resolver: null,
          reason: "RESOLVER_NOT_FOUND",
        } as const satisfies ResolverVersionResult;
      }

      const ethereum = yield* EthereumClient;

      const version = yield* ethereum
        .readContract({
          address: discovery.address,
          abi: versionableResolverAbi,
          functionName: "recordVersions",
          args: [discovery.node],
        })
        .pipe(Effect.catchTag("ContractError", () => Effect.succeed(null)));

      if (version === null) {
        return {
          supported: false,
          name,
          resolver: discovery.address,
          reason: "VERSIONING_UNSUPPORTED",
        } as const satisfies ResolverVersionResult;
      }

      return {
        supported: true,
        name,
        resolver: discovery.address,
        version,
      } as const satisfies ResolverVersionResult;
    }),
  );
});

export const getResolverVersion = defineReadAction<
  GetResolverVersionParameters,
  ResolverVersionResult,
  GetResolverVersionError
>(getResolverVersionEffect);

export {
  ResolverVersionResult,
  type GetResolverVersionError,
  type GetResolverVersionParameters,
} from "./types.js";
