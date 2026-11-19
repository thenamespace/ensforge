import { Array as Arr, Option } from "effect";

import {
  decodeFunctionData,
  encodeFunctionResult,
  isAddressEqual,
  slice,
  toFunctionSelector,
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
      // JSON-RPC fixes the shape of `eth_getCode` params.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const [address] = request.params as readonly [Address];
      return Arr.some(options.code ?? [], (deployed) => isAddressEqual(deployed, address))
        ? "0x60006000"
        : "0x";
    }
    if (request.method !== "eth_call") return options.fallback?.(request);

    // JSON-RPC fixes the shape of `eth_call` params.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const [call] = request.params as readonly [{ readonly to: Address; readonly data: Hex }];
    // Several stubs may share an address (a contract with many interfaces): the first that
    // implements the called function answers.
    const stubs = Arr.filter(options.contracts, (contract) =>
      isAddressEqual(contract.address, call.to),
    );
    if (stubs.length === 0) throw new Error(`Unscripted eth_call to ${call.to}`);
    const selector = slice(call.data, 0, 4);
    const stub =
      Arr.findFirst(stubs, (contract) =>
        Arr.some(
          contract.abi,
          (item) =>
            item.type === "function" &&
            toFunctionSelector(item) === selector &&
            contract.functions[item.name] !== undefined,
        ),
      ).pipe(Option.getOrUndefined) ?? stubs[0];
    if (stub === undefined) throw new Error(`Unscripted eth_call to ${call.to}`);
    const { functionName, args } = decodeFunctionData({ abi: stub.abi, data: call.data });
    const answer = stub.functions[functionName];
    if (answer === undefined) throw new Error(`Unscripted ${functionName} on ${call.to}`);
    return encodeFunctionResult({
      abi: stub.abi,
      functionName,
      result: answer(args ?? []),
    });
  };
