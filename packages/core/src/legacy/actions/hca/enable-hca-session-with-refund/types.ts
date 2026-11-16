import type { EnableHcaSessionParameters } from "../enable-hca-session/types.js";
import type { HcaSessionRefund } from "../types.js";

export interface EnableHcaSessionWithRefundParameters extends EnableHcaSessionParameters {
  readonly refund: HcaSessionRefund;
}
