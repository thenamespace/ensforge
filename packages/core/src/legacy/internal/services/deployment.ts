import { Context } from "effect";

import type { EnsDeploymentProfile } from "../../config/config.js";

export class DeploymentService extends Context.Service<
  DeploymentService,
  {
    readonly profile: EnsDeploymentProfile;
  }
>()("@ensforge/core/DeploymentService") {}
