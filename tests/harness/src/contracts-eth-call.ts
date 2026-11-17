import {
  decodeFunctionData,
  encodeFunctionResult,
  isAddressEqual,
  type Abi,
  type Address,
  type Hex,
} from "viem";

import type { Script } from "./transport.js";

/** Scripted view functions of one contract, answered by function name with decoded arguments. */
export type ContractStub = {
  readonly address: Address;
  readonly abi: Abi;
  readonly functions: Readonly<Record<string, (args: readonly unknown[]) => unknown>>;
};

/**
 * A script answering `eth_call` from contract stubs and `eth_getCode` from `code` (missing
 * addresses have no code). Other requests go to `fallback`; unscripted calls fail loudly.
 */
export const contractScript =
  (options: {
    readonly contracts: readonly ContractStub[];
    readonly code?: readonly Address[] | undefined;
    readonly fallback?: Script | undefined;
  }): Script =>
  (request) => {
    if (request.method === "eth_getCode") {
      const [address] = request.params as readonly [Address];
      return (options.code ?? []).some((deployed) => isAddressEqual(deployed, address))
        ? "0x60006000"
        : "0x";
    }
    if (request.method !== "eth_call") return options.fallback?.(request);

    const [call] = request.params as readonly [{ readonly to: Address; readonly data: Hex }];
    const stub = options.contracts.find((contract) => isAddressEqual(contract.address, call.to));
    if (stub === undefined) throw new Error(`Unscripted eth_call to ${call.to}`);
    const { functionName, args } = decodeFunctionData({ abi: stub.abi, data: call.data });
    const answer = stub.functions[functionName];
    if (answer === undefined) throw new Error(`Unscripted ${functionName} on ${call.to}`);
    return encodeFunctionResult({
      abi: stub.abi,
      functionName,
      result: answer(args ?? []),
    } as never);
  };
