import { makeReverseNameAction } from "../mutation.js";
import type { SetPrimaryNameParameters } from "../types.js";

export const setPrimaryName = makeReverseNameAction(
  "setPrimaryName",
  (parameters: SetPrimaryNameParameters) => ({
    name: parameters.name,
    ...(parameters.verifyForward === undefined ? {} : { verifyForward: parameters.verifyForward }),
  }),
);

export type {
  ReverseNameWriteError as SetPrimaryNameError,
  ReverseNameWriteResult as SetPrimaryNameResult,
  SetPrimaryNameParameters,
} from "../types.js";
