import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { HcaErrorResult, VerifiedHcaAccount, VerifyHcaParameters } from "../types.js";
import { verifyHca } from "../verify-hca/index.js";

export interface HcaCapabilities {
  readonly account: VerifiedHcaAccount;
  readonly ownerExecution: true;
  readonly sessionExecution: true;
  readonly moduleInstallation: false;
  readonly delegatecall: false;
  readonly reasons: readonly string[];
}

export const getHcaCapabilities = defineReadAction<
  VerifyHcaParameters,
  HcaCapabilities,
  HcaErrorResult
>((config, parameters) =>
  verifyHca.effect(config, parameters).pipe(
    Effect.map((account) => ({
      account,
      ownerExecution: true,
      sessionExecution: true,
      moduleInstallation: false,
      delegatecall: false,
      reasons: [
        "Destination sessions require a confirmed enablement reference and a compatible execution adapter",
      ],
    })),
  ),
);
