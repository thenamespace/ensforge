import { defineAction } from "../../../action/action.js";
import { prepareHcaSession } from "../../../internal/hca/prepare-session.js";
import type { WriteError } from "../../../write/types.js";
import type { HcaSessionAuthorization } from "../types.js";
import type { EnableHcaSessionWithRefundParameters } from "./types.js";

/** Sign a reusable session authorization without submitting a transaction. */
export const enableHcaSessionWithRefund = defineAction<
  EnableHcaSessionWithRefundParameters,
  HcaSessionAuthorization,
  WriteError
>(prepareHcaSession);

export type { EnableHcaSessionWithRefundParameters } from "./types.js";
