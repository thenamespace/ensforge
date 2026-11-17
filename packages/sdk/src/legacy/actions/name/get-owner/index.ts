import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { DeploymentService } from "../../../internal/services/deployment.js";
import { normalizeName } from "../../../names/normalize.js";
import { routeOwner } from "./route.js";
import type { GetOwnerError, GetOwnerParameters, OwnerResult } from "./types.js";
import { getOwnerV1 } from "./v1.js";
import { getOwnerV2 } from "./v2.js";

const getOwnerWithServices = Effect.fn("getOwnerWithServices")(function* (
  name: ReturnType<typeof normalizeName>,
) {
  const deployment = yield* DeploymentService;

  yield* Effect.annotateCurrentSpan({
    "ens.name": name,
    "ens.deployment.protocol": deployment.profile.protocol,
  });

  switch (deployment.profile.protocol) {
    case "v1":
      return yield* getOwnerV1(name, deployment.profile.v1);
    case "v2": {
      const v1 = deployment.profile.v1;

      return v1 === undefined
        ? yield* getOwnerV2(name, deployment.profile.v2)
        : yield* routeOwner(name, v1, deployment.profile.v2);
    }
  }
});

const getOwnerEffect = Effect.fn("ensforge.getOwner")(function* (
  config: EnsforgeConfig,
  parameters: GetOwnerParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(config, parameters, getOwnerWithServices(name));
});

export const getOwner = defineReadAction<GetOwnerParameters, OwnerResult | null, GetOwnerError>(
  getOwnerEffect,
);

export {
  OwnerResult,
  OwnershipLevel,
  type GetOwnerError,
  type GetOwnerParameters,
} from "./types.js";
