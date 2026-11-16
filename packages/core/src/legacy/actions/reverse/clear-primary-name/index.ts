import { makeReverseNameAction } from "../mutation.js";
import type { ClearPrimaryNameParameters } from "../types.js";

export const clearPrimaryName = makeReverseNameAction(
  "clearPrimaryName",
  (_parameters: ClearPrimaryNameParameters) => ({ name: "" }),
);

export type {
  ClearPrimaryNameParameters,
  ReverseNameWriteError as ClearPrimaryNameError,
  ReverseNameWriteResult as ClearPrimaryNameResult,
} from "../types.js";
