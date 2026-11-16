import { makeReverseNameAction } from "../mutation.js";
import type { SetPrimaryNameForAddressParameters } from "../types.js";

export const setPrimaryNameForAddress = makeReverseNameAction(
  "setPrimaryNameForAddress",
  (parameters: SetPrimaryNameForAddressParameters) => ({
    target: parameters.address,
    name: parameters.name,
    ...(parameters.verifyForward === undefined ? {} : { verifyForward: parameters.verifyForward }),
  }),
);

export type {
  ReverseNameWriteError as SetPrimaryNameForAddressError,
  ReverseNameWriteResult as SetPrimaryNameForAddressResult,
  SetPrimaryNameForAddressParameters,
} from "../types.js";
