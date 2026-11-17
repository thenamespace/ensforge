import { decodeFunctionData, type Abi, type Hex } from "viem";

/** A call's function and arguments under `abi`, or `undefined` when `data` is not one of its calls. */
export const decodeCall = (
  abi: Abi,
  data: Hex,
):
  | { readonly functionName: string; readonly args?: readonly unknown[] | undefined }
  | undefined => {
  try {
    return decodeFunctionData({ abi, data });
  } catch {
    return undefined;
  }
};
