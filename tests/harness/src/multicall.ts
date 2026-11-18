import { Array as Arr } from "effect";

import {
  decodeFunctionData,
  encodeFunctionResult,
  isAddressEqual,
  multicall3Abi,
  type Address,
  type Hex,
} from "viem";

import type { Script } from "./transport.js";

/** One contract call as the chain sees it. */
export type ContractCall = { readonly to: Address; readonly data: Hex };

/** How the chain answers one call: its return data, or a revert with `data`. */
export type CallResult =
  | { readonly success: true; readonly returnData: Hex }
  | { readonly success: false; readonly returnData: Hex };

/**
 * A script that answers `eth_call`s per contract call: Multicall3 `aggregate3` batches are
 * unpacked and answered call by call, and direct calls are answered the same way, with a failure
 * thrown as a JSON-RPC execution-reverted error (code 3). Returning `undefined` leaves the request
 * unscripted, which fails the test.
 */
export const callScript =
  (multicall3: Address, answer: (call: ContractCall) => CallResult | undefined): Script =>
  ({ method, params }) => {
    if (method !== "eth_call") return undefined;

    // JSON-RPC fixes the shape of `eth_call` params.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const { to, data } = params[0] as { readonly to: Address; readonly data: Hex };
    if (!isAddressEqual(to, multicall3)) {
      const result = answer({ to, data });
      if (result === undefined || result.success) return result?.returnData;
      throw Object.assign(new Error("execution reverted"), { code: 3, data: result.returnData });
    }

    const { functionName, args } = decodeFunctionData({ abi: multicall3Abi, data });
    if (functionName !== "aggregate3") return undefined;

    const results = Arr.map(args[0], ({ target, callData }) => {
      const result = answer({ to: target, data: callData });
      if (result === undefined) throw new Error(`Unscripted call to ${target}: ${callData}`);
      return result;
    });
    return encodeFunctionResult({
      abi: multicall3Abi,
      functionName: "aggregate3",
      result: results,
    });
  };
