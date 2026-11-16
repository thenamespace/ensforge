import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { DeploymentService } from "../../../internal/services/deployment.js";
import { normalizeName } from "../../../names/normalize.js";
import { routeExpiry } from "./route.js";
import type { ExpiryResult, GetExpiryError, GetExpiryParameters } from "./types.js";
import { getExpiryV1 } from "./v1.js";
import { getExpiryV2 } from "./v2.js";

const getExpiryWithServices = Effect.fn("getExpiryWithServices")(function* (
  name: ReturnType<typeof normalizeName>,
) {
  const deployment = yield* DeploymentService;

  yield* Effect.annotateCurrentSpan({
    "ens.name": name,
    "ens.deployment.protocol": deployment.profile.protocol,
  });

  switch (deployment.profile.protocol) {
    case "v1":
      return yield* getExpiryV1(name, deployment.profile.v1);
    case "v2": {
      const v1 = deployment.profile.v1;

      return v1 === undefined
        ? yield* getExpiryV2(name, deployment.profile.v2)
        : yield* routeExpiry(name, v1, deployment.profile.v2);
    }
  }
});

const getExpiryEffect = Effect.fn("ensforge.getExpiry")(function* (
  config: EnsforgeConfig,
  parameters: GetExpiryParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(config, parameters, getExpiryWithServices(name));
});

export const getExpiry = defineReadAction<GetExpiryParameters, ExpiryResult | null, GetExpiryError>(
  getExpiryEffect,
);

export {
  ExpiryResult,
  ExpirySource,
  type GetExpiryError,
  type GetExpiryParameters,
} from "./types.js";
