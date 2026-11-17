import { Context, Effect, Layer, Schema } from "effect";

import type {
  Abi,
  Address,
  Block,
  CallParameters,
  CallReturnType,
  ContractFunctionArgs,
  ContractFunctionName,
  GetLogsParameters,
  Hash,
  Log,
  ReadContractParameters,
  ReadContractReturnType,
  SendTransactionParameters,
  Transaction,
  TransactionReceipt,
} from "viem";

import type { DevnetClient } from "./client.ts";
import { Devnet } from "./Devnet.ts";

/** A devnet RPC call failed; `method` names the viem action. */
export class ChainError extends Schema.TaggedError<ChainError, { readonly brand: unique symbol }>()(
  "ChainError",
  { method: Schema.String, cause: Schema.Defect() },
) {}

type ReadFunction<abi extends Abi | readonly unknown[]> = ContractFunctionName<
  abi,
  "pure" | "view"
>;
type ReadArgs<
  abi extends Abi | readonly unknown[],
  functionName extends ReadFunction<abi>,
> = ContractFunctionArgs<abi, "pure" | "view", functionName>;
type WriteParameters = Parameters<DevnetClient["writeContract"]>[0];
/** The parts of an ensforge plan event (`Plan.Event`) that `passWaits` reads. */
type PlanEvent = {
  readonly status: string;
  readonly step: { readonly waitFor?: { readonly seconds: bigint } | undefined };
};
type SimulateParameters = Parameters<DevnetClient["simulateContract"]>[0];

const rpc = <A>(method: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => new ChainError({ method, cause }) });

/** The running devnet as Effects: reads and writes, accounts, time and snapshots. */
export class Chain extends Context.Service<
  Chain,
  {
    /** The latest block. */
    readonly latestBlock: Effect.Effect<Block, ChainError>;
    /** The latest block's timestamp, in seconds. */
    readonly now: Effect.Effect<bigint, ChainError>;
    readonly blockNumber: Effect.Effect<bigint, ChainError>;
    readonly balance: (address: Address) => Effect.Effect<bigint, ChainError>;
    readonly read: <
      const abi extends Abi | readonly unknown[],
      functionName extends ReadFunction<abi>,
      const args extends ReadArgs<abi, functionName>,
    >(
      parameters: ReadContractParameters<abi, functionName, args>,
    ) => Effect.Effect<ReadContractReturnType<abi, functionName, args>, ChainError>;
    readonly call: (parameters: CallParameters) => Effect.Effect<CallReturnType, ChainError>;
    readonly simulate: (parameters: SimulateParameters) => Effect.Effect<unknown, ChainError>;
    readonly logs: (parameters: GetLogsParameters) => Effect.Effect<readonly Log[], ChainError>;
    readonly transaction: (hash: Hash) => Effect.Effect<Transaction, ChainError>;
    /** Waits until `hash` is mined. */
    readonly receipt: (hash: Hash) => Effect.Effect<TransactionReceipt, ChainError>;
    /** Sends a contract call from an unlocked account and waits for its receipt. */
    readonly write: (parameters: WriteParameters) => Effect.Effect<TransactionReceipt, ChainError>;
    /** Sends a contract call from an unlocked account without waiting for it to be mined. */
    readonly submit: (parameters: WriteParameters) => Effect.Effect<Hash, ChainError>;
    /** Sends a transaction from an unlocked account and waits for its receipt. */
    readonly send: (
      parameters: SendTransactionParameters,
    ) => Effect.Effect<TransactionReceipt, ChainError>;
    readonly setBalance: (address: Address, value: bigint) => Effect.Effect<void, ChainError>;
    readonly mine: (blocks?: number) => Effect.Effect<void, ChainError>;
    readonly increaseTime: (seconds: number) => Effect.Effect<void, ChainError>;
    readonly setNextBlockTimestamp: (timestamp: bigint) => Effect.Effect<void, ChainError>;
    readonly setAutomine: (enabled: boolean) => Effect.Effect<void, ChainError>;
    readonly dropTransaction: (hash: Hash) => Effect.Effect<void, ChainError>;
    /** Runs `effect`, then reverts the chain to where it was. */
    readonly isolated: <A, E, R>(
      effect: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | ChainError, R>;
    /** Runs `effect` on a block mined at `timestamp`, isolated like {@link isolated}. */
    readonly atTimestamp: <A, E, R>(
      timestamp: bigint,
      effect: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | ChainError, R>;
    /**
     * An `onStep` that moves the clock past each wait a plan asks for (a commitment's minimum
     * age); the devnet's time only moves with its blocks.
     */
    readonly passWaits: (event: PlanEvent) => void;
  }
>()("@ensforge/test-devnet/Chain") {
  static readonly layer = Layer.effect(
    Chain,
    Effect.gen(function* () {
      const { client } = yield* Devnet;
      const latestBlock = rpc("getBlock", () => client.getBlock());
      const receipt = (hash: Hash) =>
        rpc("waitForTransactionReceipt", () => client.waitForTransactionReceipt({ hash }));
      const mine = (blocks = 1) => rpc("mine", () => client.mine({ blocks }));
      const increaseTime = (seconds: number) =>
        rpc("increaseTime", () => client.increaseTime({ seconds }));
      const setNextBlockTimestamp = (timestamp: bigint) =>
        rpc("setNextBlockTimestamp", () => client.setNextBlockTimestamp({ timestamp }));

      const isolated = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Effect.acquireUseRelease(
          rpc("snapshot", () => client.snapshot()),
          () => effect,
          (id) => Effect.orDie(rpc("revert", () => client.revert({ id }))),
        );

      return Chain.of({
        latestBlock,
        now: Effect.map(latestBlock, (block) => block.timestamp),
        blockNumber: rpc("getBlockNumber", () => client.getBlockNumber()),
        balance: (address) => rpc("getBalance", () => client.getBalance({ address })),
        read: (parameters) =>
          rpc("readContract", () => client.readContract(parameters as never)) as never,
        call: (parameters) => rpc("call", () => client.call(parameters)),
        simulate: (parameters) =>
          rpc("simulateContract", () => client.simulateContract(parameters)),
        logs: (parameters) => rpc("getLogs", () => client.getLogs(parameters)),
        transaction: (hash) => rpc("getTransaction", () => client.getTransaction({ hash })),
        receipt,
        submit: (parameters) => rpc("writeContract", () => client.writeContract(parameters)),
        write: (parameters) =>
          Effect.flatMap(
            rpc("writeContract", () => client.writeContract(parameters)),
            receipt,
          ),
        send: (parameters) =>
          Effect.flatMap(
            rpc("sendTransaction", () => client.sendTransaction(parameters)),
            receipt,
          ),
        setBalance: (address, value) =>
          rpc("setBalance", () => client.setBalance({ address, value })),
        mine,
        increaseTime,
        setNextBlockTimestamp,
        setAutomine: (enabled) => rpc("setAutomine", () => client.setAutomine(enabled)),
        dropTransaction: (hash) => rpc("dropTransaction", () => client.dropTransaction({ hash })),
        isolated,
        atTimestamp: (timestamp, effect) =>
          isolated(
            setNextBlockTimestamp(timestamp).pipe(Effect.andThen(mine()), Effect.andThen(effect)),
          ),
        passWaits: (event) => {
          const seconds = event.step.waitFor?.seconds;
          if (event.status !== "waiting" || seconds === undefined) return;
          Effect.runFork(increaseTime(Number(seconds)).pipe(Effect.andThen(mine())));
        },
      });
    }),
  );
}
