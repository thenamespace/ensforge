import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { readNameRoute } from "../../../internal/name/name-route.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import type { EthereumAddress } from "../../../schemas/identity.js";
import type { GetNameStateError, GetNameStateParameters } from "../get-name-state/types.js";

const getRegistryEffect = Effect.fn("ensforge.getRegistry")(function* (
  config: EnsforgeConfig,
  parameters: GetNameStateParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    readNameRoute(name).pipe(
      Effect.map((route) => {
        if (route.kind === "v1") return route.deployment.contracts.registry;

        if (route.kind === "reserved") return route.v1.contracts.registry;

        return route.parentRegistry;
      }),
    ),
  );
});

export const getRegistry = defineReadAction<
  GetNameStateParameters,
  EthereumAddress,
  GetNameStateError
>(getRegistryEffect);

export type {
  GetNameStateError as GetRegistryError,
  GetNameStateParameters as GetRegistryParameters,
} from "../get-name-state/types.js";

export type GetRegistryResult = EthereumAddress;
