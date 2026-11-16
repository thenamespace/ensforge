import { defineAction } from "../../../action/action.js";
import { prepareHcaSession } from "../../../internal/hca/prepare-session.js";
import type { WriteError } from "../../../write/types.js";
import type { HcaSessionAuthorization } from "../types.js";
import type { EnableHcaSessionParameters } from "./types.js";

/** Sign a reusable session authorization without submitting a transaction. */
export const enableHcaSession = defineAction<
  EnableHcaSessionParameters,
  HcaSessionAuthorization,
  WriteError
>(prepareHcaSession);

export type { EnableHcaSessionParameters } from "./types.js";
