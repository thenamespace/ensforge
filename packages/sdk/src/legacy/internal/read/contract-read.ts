import { Effect, Request } from "effect";

import {
  encodeFunctionData,
  type Abi,
  type Address,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type ContractFunctionParameters,
  type ContractFunctionReturnType,
  type Hex,
} from "viem";

import type { BlockParameters } from "../../action/block.js";
import { viemErrorToEffectError, type ViemError } from "../errors/viem-error.js";

export type ContractReadParameters<
  abi extends Abi = Abi,
  functionName extends ContractFunctionName<abi, "pure" | "view"> = ContractFunctionName<
    abi,
    "pure" | "view"
  >,
  args extends ContractFunctionArgs<abi, "pure" | "view", functionName> = ContractFunctionArgs<
    abi,
    "pure" | "view",
    functionName
  >,
> = ContractFunctionParameters<abi, "pure" | "view", functionName, args> &
  BlockParameters & {
    readonly account?: Address;
  };

interface ContractReadRequestFields {
  readonly requestKey: string;
  readonly groupKey: string;
  readonly contract: ContractFunctionParameters;
  readonly callData: Hex;
  readonly blockNumber?: bigint;
  readonly blockTag?: ContractReadParameters["blockTag"];
  readonly account?: Address;
}

export class ContractReadRequest<Success = unknown> extends Request.Class<
  ContractReadRequestFields,
  Success,
  ViemError,
  never
> {}

export const makeContractReadRequest = Effect.fn("makeContractReadRequest")(function* <
  const abi extends Abi,
  functionName extends ContractFunctionName<abi, "pure" | "view">,
  const args extends ContractFunctionArgs<abi, "pure" | "view", functionName>,
>(parameters: ContractReadParameters<abi, functionName, args>) {
  const contract: ContractFunctionParameters = {
    address: parameters.address,
    abi: parameters.abi,
    functionName: parameters.functionName,
    ...(Array.isArray(parameters.args) ? { args: parameters.args } : {}),
  };

  const callData = yield* Effect.try({
    try: () => encodeFunctionData(contract),
    catch: (cause) => viemErrorToEffectError(cause, "encodeFunctionData"),
  });

  const blockKey =
    parameters.blockNumber === undefined
      ? `tag:${parameters.blockTag ?? "latest"}`
      : `number:${parameters.blockNumber}`;

  const groupKey = `${blockKey}|account:${parameters.account?.toLowerCase() ?? "none"}`;
  const requestKey = `${groupKey}|target:${parameters.address.toLowerCase()}|data:${callData}`;

  return new ContractReadRequest<
    ContractFunctionReturnType<abi, "pure" | "view", functionName, args>
  >({
    requestKey,
    groupKey,
    contract,
    callData,
    ...(parameters.blockNumber === undefined
      ? parameters.blockTag === undefined
        ? {}
        : { blockTag: parameters.blockTag }
      : { blockNumber: parameters.blockNumber }),
    ...(parameters.account === undefined ? {} : { account: parameters.account }),
  });
});
