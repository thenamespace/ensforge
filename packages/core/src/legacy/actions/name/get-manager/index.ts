import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { readNameRoute } from "../../../internal/name/name-route.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import type { EthereumAddress } from "../../../schemas/identity.js";
import type { GetNameStateError, GetNameStateParameters } from "../get-name-state/types.js";
import { getOwnerV1 } from "../get-owner/v1.js";

const getManagerEffect = Effect.fn("ensforge.getManager")(function* (
  config: EnsforgeConfig,
  parameters: GetNameStateParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const route = yield* readNameRoute(name);

      if (route.kind === "v2" || route.kind === "available") {
        return route.kind === "v2" && route.state.status === 2 ? route.state.latestOwner : null;
      }

      const owner = yield* getOwnerV1(
        name,
        route.kind === "reserved" ? route.v1 : route.deployment,
      );

      return owner?.owner ?? null;
    }),
  );
});

export const getManager = defineReadAction<
  GetNameStateParameters,
  EthereumAddress | null,
  GetNameStateError
>(getManagerEffect);

export type {
  GetNameStateError as GetManagerError,
  GetNameStateParameters as GetManagerParameters,
} from "../get-name-state/types.js";

export type GetManagerResult = EthereumAddress | null;
