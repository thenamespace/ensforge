import { makeReverseNameAction } from "../mutation.js";
import type { SetContractPrimaryNameParameters } from "../types.js";

export const setContractPrimaryName = makeReverseNameAction(
  "setContractPrimaryName",
  (parameters: SetContractPrimaryNameParameters) => ({
    target: parameters.contract,
    targetKind: "contract",
    name: parameters.name,
    ...(parameters.verifyForward === undefined ? {} : { verifyForward: parameters.verifyForward }),
  }),
);

export type {
  ReverseNameWriteError as SetContractPrimaryNameError,
  ReverseNameWriteResult as SetContractPrimaryNameResult,
  SetContractPrimaryNameParameters,
} from "../types.js";
