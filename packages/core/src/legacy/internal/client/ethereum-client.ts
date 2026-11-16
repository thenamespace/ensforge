import { Context, Effect, Semaphore } from "effect";

import type {
  Abi,
  ContractFunctionArgs,
  ContractFunctionName,
  ContractFunctionReturnType,
  MulticallParameters,
  MulticallReturnType,
  PublicClient,
  ReadContractParameters,
  ReadContractReturnType,
} from "viem";

import { defaultReadOptions } from "../../config/read-options.js";
import type { ViemError } from "../errors/viem-error.js";
import { viemErrorToEffectError } from "../errors/viem-error.js";
import { executeContractRead } from "../read/contract-read-resolver.js";
import { makeContractReadRequest, type ContractReadParameters } from "../read/contract-read.js";
import { ReadContext } from "../read/execution-context.js";

export interface EthereumClientOptions {
  readonly publicClient: PublicClient;
  readonly readSemaphore?: Semaphore.Semaphore;
}

export interface EthereumClientService {
  readonly readContract: <
    const abi extends Abi,
    functionName extends ContractFunctionName<abi, "pure" | "view">,
    const args extends ContractFunctionArgs<abi, "pure" | "view", functionName>,
  >(
    parameters: ContractReadParameters<abi, functionName, args>,
  ) => Effect.Effect<
    ContractFunctionReturnType<abi, "pure" | "view", functionName, args>,
    ViemError,
    ReadContext
  >;

  readonly readContractDirect: <
    const abi extends Abi | readonly unknown[],
    functionName extends ContractFunctionName<abi, "pure" | "view">,
    const args extends ContractFunctionArgs<abi, "pure" | "view", functionName>,
  >(
    parameters: ReadContractParameters<abi, functionName, args>,
  ) => Effect.Effect<ReadContractReturnType<abi, functionName, args>, ViemError>;

  readonly multicall: <
    const contracts extends readonly unknown[],
    const allowFailure extends boolean = true,
  >(
    parameters: MulticallParameters<contracts, allowFailure>,
  ) => Effect.Effect<MulticallReturnType<contracts, allowFailure>, ViemError>;
}

export class EthereumClient extends Context.Service<EthereumClient, EthereumClientService>()(
  "@ensforge/core/internal/client/EthereumClient",
) {}

export const makeEthereumClient = ({
  publicClient,
  readSemaphore = Semaphore.makeUnsafe(defaultReadOptions.concurrency),
}: EthereumClientOptions): EthereumClientService => {
  const readContract = Effect.fn("EthereumClient.readContract")(function* <
    const abi extends Abi,
    functionName extends ContractFunctionName<abi, "pure" | "view">,
    const args extends ContractFunctionArgs<abi, "pure" | "view", functionName>,
  >(
    parameters: ContractReadParameters<abi, functionName, args>,
  ): Effect.fn.Return<
    ContractFunctionReturnType<abi, "pure" | "view", functionName, args>,
    ViemError,
    ReadContext
  > {
    const context = yield* ReadContext;

    const block =
      parameters.blockNumber !== undefined
        ? { blockNumber: parameters.blockNumber }
        : parameters.blockTag !== undefined
          ? { blockTag: parameters.blockTag }
          : context.block;

    const request = yield* makeContractReadRequest<abi, functionName, args>({
      ...parameters,
      ...block,
    } as ContractReadParameters<abi, functionName, args>);

    return yield* executeContractRead(request, context.contractReadResolver);
  });

  return EthereumClient.of({
    readContract,
    readContractDirect: Effect.fn("EthereumClient.readContractDirect")((parameters) =>
      readSemaphore.withPermit(
        Effect.tryPromise({
          try: () => publicClient.readContract(parameters),
          catch: (cause) => viemErrorToEffectError(cause, "readContract"),
        }),
      ),
    ),
    multicall: Effect.fn("EthereumClient.multicall")((parameters) =>
      readSemaphore.withPermit(
        Effect.tryPromise({
          try: () => publicClient.multicall(parameters),
          catch: (cause) => viemErrorToEffectError(cause, "multicall"),
        }),
      ),
    ),
  });
};
