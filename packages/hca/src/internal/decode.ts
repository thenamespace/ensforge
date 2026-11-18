import { decodeFunctionData, type Abi, type DecodeFunctionDataReturnType, type Hex } from "viem";

/** A call's function and arguments under `abi`, or `undefined` when `data` is not one of its calls. */
export const decodeCall = <const abi extends Abi>(
  abi: abi,
  data: Hex,
): DecodeFunctionDataReturnType<abi> | undefined => {
  try {
    return decodeFunctionData({ abi, data });
  } catch {
    return undefined;
  }
};
