import { Effect } from "effect";

import { defineAction } from "../../../action/action.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { transferName } from "../../ownership/transfer-name/index.js";
import type { TransferNameResult } from "../../ownership/types.js";
import { resolveSubnameRoute } from "../route.js";
import type { SubnameError, TransferSubnameParameters } from "../types.js";

const transferSubnameEffect = Effect.fn("ensforge.transferSubname")(function* (
  config: EnsforgeConfig,
  parameters: TransferSubnameParameters,
) {
  yield* resolveSubnameRoute(config, parameters.name);

  return yield* transferName.effect(config, parameters);
});

export const transferSubname = defineAction<
  TransferSubnameParameters,
  TransferNameResult,
  SubnameError
>(transferSubnameEffect);

export type { TransferSubnameParameters, SubnameError as TransferSubnameError } from "../types.js";
