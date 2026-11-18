/* oxlint-disable typescript/no-unsafe-type-assertion -- viem's generic overloads cannot relate a runtime ABI to its arguments */
import { Effect } from "effect";

import {
  encodeFunctionData,
  type Abi,
  type Address,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type ContractFunctionReturnType,
} from "viem";
import { readContract as viemReadContract } from "viem/actions";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import { ContractRead, resolverOf } from "./batch-resolver.js";
import { fromPromise } from "./fromPromise.js";

/**
 * Parameters of one contract read.
 *
 * @stability unstable
 */
export type ReadContractParameters<
  abi extends Abi,
  functionName extends ContractFunctionName<abi, "pure" | "view">,
> = {
  readonly address: Address;
  readonly abi: abi;
  readonly functionName: functionName;
  readonly args?: ContractFunctionArgs<abi, "pure" | "view", functionName> | undefined;
  /** Gas limit for the call; a bounded read runs on its own, outside multicall. */
  readonly gas?: bigint | undefined;
} & Read.BlockOptions;

/**
 * Reads a contract, coalesced into multicall with other reads made in the same tick unless the
 * client disables batching.
 *
 * @stability unstable
 */
export const readContract = <
  const abi extends Abi,
  functionName extends ContractFunctionName<abi, "pure" | "view">,
>(
  client: Client,
  parameters: ReadContractParameters<abi, functionName>,
): Effect.Effect<ContractFunctionReturnType<abi, "pure" | "view", functionName>, AnyError> => {
  type Result = ContractFunctionReturnType<abi, "pure" | "view", functionName>;
  const { multicall } = client.config.batch;
  const args = (parameters.args ?? []) as readonly unknown[];

  // Chains without Multicall3 (e.g. a bare devnet) read one call at a time.
  if (
    multicall === false ||
    parameters.gas !== undefined ||
    client.publicClient.chain?.contracts?.multicall3 === undefined
  ) {
    return fromPromise(
      () =>
        viemReadContract(client.publicClient, {
          address: parameters.address,
          // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- tsc requires this assertion; tsgolint resolves the parameter type differently
          abi: parameters.abi as Abi,
          functionName: parameters.functionName,
          args,
          ...(parameters.gas === undefined ? {} : { gas: parameters.gas }),
          ...(parameters.blockNumber === undefined
            ? { blockTag: parameters.blockTag ?? client.config.blockTag }
            : { blockNumber: parameters.blockNumber }),
        }) as Promise<Result>,
      { contract: parameters.address, functionName: parameters.functionName },
    );
  }

  const request = new ContractRead({
    address: parameters.address,
    abi: parameters.abi,
    functionName: parameters.functionName,
    args,
    // `ReadContractParameters` already checks the arguments against the ABI.
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- tsc requires this assertion; tsgolint resolves the parameter type differently
    callData: encodeFunctionData({
      abi: parameters.abi,
      functionName: parameters.functionName,
      args,
    } as never),
    blockNumber: parameters.blockNumber,
    blockTag: parameters.blockTag ?? client.config.blockTag,
  });

  return Effect.request(
    request,
    resolverOf(client, multicall.batchSize, multicall.wait),
  ) as Effect.Effect<Result, AnyError>;
};

/**
 * {@link readContract} that returns `undefined` when the call reverts, e.g. `ownerOf` on an
 * expired token, including reverts translated into a specific class (`NameNotRenewable` →
 * `NameStateError`). Network and configuration failures still fail.
 *
 * @stability unstable
 */
export const readContractOrUndefined = <
  const abi extends Abi,
  functionName extends ContractFunctionName<abi, "pure" | "view">,
>(
  client: Client,
  parameters: ReadContractParameters<abi, functionName>,
): Effect.Effect<
  ContractFunctionReturnType<abi, "pure" | "view", functionName> | undefined,
  AnyError
> =>
  readContract(client, parameters).pipe(
    Effect.catchIf(
      (error: AnyError) => error.context.revert !== undefined,
      () => Effect.undefined,
    ),
  );
