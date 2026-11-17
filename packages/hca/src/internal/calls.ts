import {
  standaloneHcaFactoryV2Abi,
  standaloneSingleOwnerHcaV2Abi,
} from "@ensforge/contracts/v2/experimental/hca";
import type { Plan } from "@ensforge/sdk";
import { encodeFunctionData, type Address, type Hex } from "viem";

import { decodeCall } from "./decode.js";

/**
 * One `executeByOwner` call running `calls` from the HCA. With `fund`, the owner sends their total
 * value along; otherwise the HCA pays it from its balance (bundlers, intents).
 */
export const executeByOwnerCall = (
  hca: Address,
  calls: readonly Plan.Call[],
  fund = true,
): Plan.Call => ({
  to: hca,
  data: encodeFunctionData({
    abi: standaloneSingleOwnerHcaV2Abi,
    functionName: "executeByOwner",
    args: [calls.map((call) => ({ target: call.to, value: call.value, callData: call.data }))],
  }),
  value: fund ? calls.reduce((total, call) => total + call.value, 0n) : 0n,
});

/** The calls inside an `executeByOwner` call, or `undefined` for any other call. */
export const innerCalls = (call: Plan.Call): readonly Plan.Call[] | undefined => {
  const decoded = decodeCall(standaloneSingleOwnerHcaV2Abi, call.data);
  if (decoded?.functionName !== "executeByOwner") return undefined;

  const [executions] = decoded.args as readonly [
    readonly { readonly target: Address; readonly value: bigint; readonly callData: Hex }[],
  ];
  return executions.map((execution) => ({
    to: execution.target,
    data: execution.callData,
    value: execution.value,
  }));
};

/** `StandaloneHCAFactory.deploy(owner, implementation, 0)`; idempotent. */
export const deployCall = (
  factory: Address,
  owner: Address,
  implementation: Address,
): Plan.Call => ({
  to: factory,
  data: encodeFunctionData({
    abi: standaloneHcaFactoryV2Abi,
    functionName: "deploy",
    args: [owner, implementation, 0n],
  }),
  value: 0n,
});
