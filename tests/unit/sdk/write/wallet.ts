import { Array as Arr, Effect, Fiber, Predicate, String as Str } from "effect";
import { TestClock } from "effect/testing";

import { Plan } from "@ensforge/sdk";
import * as Ensforge from "@ensforge/sdk/internal/client/Ensforge";
import type { Signer } from "@ensforge/sdk/internal/internal/write/signer";
import { scriptedTransport, type RecordedCall } from "@ensforge/test-harness";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  isHex,
  numberToHex,
  pad,
  type Address,
  type Hex,
} from "viem";
import { mainnet } from "viem/chains";

export const account = getAddress("0x00000000000000000000000000000000000a11ce");
export const target: Address = "0x00000000000000000000000000000000000000c0";
/** The timestamp of the block every transaction is mined in. */
export const minedAt = 1_800_000_000n;

export type BundleStatus =
  | number
  | { readonly code: number; readonly receipts: "none" | "omitted" | "some" };

export type WalletOptions = {
  /** The `atomic` status `wallet_getCapabilities` reports; without it the wallet lacks EIP-5792. */
  readonly atomic?: "supported" | "ready" | undefined;
  /**
   * What `wallet_getCallsStatus` reports for each bundle on each poll, the last repeating: a status
   * code (with receipts from 200 up), a code with receipts `none`, `omitted` (no field) or `some`,
   * or `unknown` when the wallet does not know the bundle.
   */
  readonly bundleStatuses?: readonly (BundleStatus | "unknown")[] | undefined;
  /** Transactions the chain no longer knows (dropped from the mempool). */
  readonly dropped?: readonly Hex[] | undefined;
  /** Transactions never mined: their receipts never come. */
  readonly unmined?: readonly Hex[] | undefined;
  /** Call data whose transactions revert once mined. */
  readonly reverting?: readonly Hex[] | undefined;
  /** What `eth_call` answers (default `0x`). */
  readonly callResult?: Hex | undefined;
  /** Call data whose simulation (`eth_call`) reverts. */
  readonly failingSimulation?: readonly Hex[] | undefined;
  /** Call data the user rejects in the wallet, alone or in a bundle. */
  readonly refused?: readonly Hex[] | undefined;
  /** The latest block's timestamp on each request, the last repeating. */
  readonly latest?: readonly bigint[] | undefined;
  readonly simulate?: boolean | undefined;
  readonly storage?: Plan.Storage | undefined;
};

/** A JSON-RPC error; viem retries uncoded errors, which would repeat requests. */
const rpcError = (code: number, message: string) => Object.assign(new Error(message), { code });

/** The parameters of a recorded or scripted request, which JSON-RPC does not type. */
export const paramsOf = (params: unknown): readonly unknown[] =>
  Arr.isArray(params) ? params : [];

/** `value` as a record, or an empty one. */
export const recordOf = (value: unknown): Record<PropertyKey, unknown> =>
  Predicate.isObject(value) ? value : {};

/** The calls of the first block an `eth_simulateV1` request simulates, if it has any. */
export const simulatedCalls = (request: Record<PropertyKey, unknown>) => {
  const blocks = request.blockStateCalls;
  const blockCalls = recordOf(Arr.isArray(blocks) ? blocks[0] : undefined).calls;
  return Arr.isArray(blockCalls) ? Arr.map(blockCalls, recordOf) : undefined;
};

/** The call data of each call in a bundle's `calls`. */
const bundledData = (bundled: unknown): Hex[] =>
  Arr.isArray(bundled)
    ? Arr.flatMap(bundled, (call) =>
        Predicate.isObject(call) && isHex(call.data) ? [call.data] : [],
      )
    : [];

const receiptOf = (hash: Hex, reverted: boolean) => ({
  transactionHash: hash,
  transactionIndex: "0x0",
  blockHash: pad("0x1"),
  blockNumber: "0x1",
  from: account,
  to: target,
  cumulativeGasUsed: "0x5208",
  gasUsed: "0x5208",
  effectiveGasPrice: "0x1",
  contractAddress: null,
  logs: [],
  logsBloom: pad("0x0", { size: 256 }),
  status: reverted ? "0x0" : "0x1",
  type: "0x2",
});

/**
 * An ensforge client and its signer on one scripted mainnet: transactions are mined at once in
 * block 1 (at `minedAt`), every call estimates 21,000 gas, the wallet sends EIP-5792 bundles as one
 * transaction when `atomic` is set, and `eth_simulateV1` is missing so calls simulate one by one.
 * `saved` holds a copy of every plan record the write saves, in order.
 */
export const scriptedWallet = (options: WalletOptions = {}) => {
  const data = new Map<Hex, readonly Hex[]>();
  const polls = new Map<string, number>();
  let latestPolls = 0;
  let sent = 0;

  const send = (calls: readonly Hex[]): Hex => {
    const hash = pad(numberToHex(++sent));
    data.set(hash, calls);
    return hash;
  };
  const reverted = (hash: Hex) =>
    Arr.some(data.get(hash) ?? [], (call) => options.reverting?.includes(call) === true);

  const { transport, calls } = scriptedTransport(({ method, params }) => {
    // A transaction or call object, or a hash, block tag or bundle id, depending on the method.
    const [first] = paramsOf(params);
    const request = recordOf(first);
    const callData = isHex(request.data) ? request.data : undefined;
    const hash = isHex(first) ? first : "0x";
    const key = Predicate.isString(first) ? first : "";
    switch (method) {
      case "eth_blockNumber":
        return "0x1";
      case "eth_estimateGas":
        return "0x5208";
      case "eth_simulateV1":
        throw rpcError(-32601, "the method eth_simulateV1 does not exist");
      case "eth_call":
        if (callData !== undefined && options.failingSimulation?.includes(callData) === true) {
          throw rpcError(-32000, "execution reverted");
        }
        return options.callResult ?? "0x";
      case "eth_sendTransaction":
        if (callData !== undefined && options.refused?.includes(callData) === true) {
          throw rpcError(4001, "the user rejected the transaction");
        }
        return send([callData ?? "0x"]);
      case "eth_getTransactionReceipt":
        return options.unmined?.includes(hash) === true ? null : receiptOf(hash, reverted(hash));
      case "eth_getTransactionByHash":
        if (options.dropped?.includes(hash) === true) return null;
        return {
          hash,
          from: account,
          to: target,
          input: "0x",
          value: "0x0",
          nonce: "0x0",
          gas: "0x5208",
          blockHash: pad("0x1"),
          blockNumber: "0x1",
          transactionIndex: "0x0",
          type: "0x0",
          gasPrice: "0x1",
          chainId: "0x1",
        };
      case "eth_getBlockByNumber": {
        const latest = options.latest ?? [minedAt];
        const timestamp =
          key === "latest"
            ? (latest[Math.min(latestPolls++, latest.length - 1)] ?? minedAt)
            : minedAt;
        return {
          number: "0x1",
          hash: pad("0x1"),
          timestamp: numberToHex(timestamp),
          transactions: [],
        };
      }
      case "wallet_getCapabilities":
        if (options.atomic === undefined)
          throw rpcError(-32601, "the method wallet_getCapabilities does not exist");
        return { "0x1": { atomic: { status: options.atomic } } };
      case "wallet_sendCalls": {
        const bundled = bundledData(request.calls);
        if (Arr.some(bundled, (call) => options.refused?.includes(call) === true)) {
          throw rpcError(4001, "the user rejected the bundle");
        }
        return { id: `bundle-${send(bundled)}` };
      }
      case "wallet_getCallsStatus": {
        const id = key;
        const statuses = options.bundleStatuses ?? [200];
        const poll = polls.get(id) ?? 0;
        polls.set(id, poll + 1);
        const status = statuses[Math.min(poll, statuses.length - 1)] ?? 200;
        if (status === "unknown") throw rpcError(5730, `unknown bundle ${id}`);
        const bundleHash = Str.slice("bundle-".length)(id);
        const { code, receipts } =
          typeof status === "number"
            ? { code: status, receipts: status >= 200 ? "some" : "none" }
            : status;
        return {
          version: "2.0.0",
          id,
          chainId: "0x1",
          atomic: true,
          status: code,
          ...(receipts === "omitted"
            ? {}
            : {
                receipts:
                  receipts === "some"
                    ? [receiptOf(isHex(bundleHash) ? bundleHash : "0x", code !== 200)]
                    : [],
              }),
        };
      }
      default:
        return undefined;
    }
  });

  const saved: Plan.Record[] = [];
  const storage = options.storage ?? Plan.memoryStorage();
  const walletClient = createWalletClient({
    chain: mainnet,
    transport,
    account,
    pollingInterval: 1,
  });
  const client = Ensforge.create({
    publicClient: createPublicClient({ chain: mainnet, transport, pollingInterval: 1 }),
    walletClient,
    simulate: options.simulate ?? false,
    storage: {
      ...storage,
      set: (record) => {
        saved.push(structuredClone(record));
        return storage.set(record);
      },
    },
  });
  const signer: Signer = { walletClient, account };

  /** The calls of each transaction the wallet sent, in order: one each, or a bundle's calls. */
  const transactions = () =>
    Arr.flatMap(calls, ({ method, params }) => {
      const [request] = paramsOf(params);
      if (method === "eth_sendTransaction") {
        return [Predicate.isObject(request) && isHex(request.data) ? [request.data] : []];
      }
      if (method !== "wallet_sendCalls") return [];
      return [bundledData(Predicate.isObject(request) ? request.calls : undefined)];
    });
  const count = (method: string) => Arr.filter(calls, (call) => call.method === method).length;

  return { client, signer, calls, saved, transactions, count };
};

/**
 * Runs `effect` while moving the test clock on, for writes that sleep between polls; the short live
 * pause lets the scripted RPC answers settle before each move.
 */
export const advancing = <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(effect);
    while (fiber.pollUnsafe() === undefined) {
      yield* TestClock.withLive(Effect.sleep("2 millis"));
      yield* TestClock.adjust("1 second");
    }
    return yield* Fiber.join(fiber);
  });

/** The first parameter of each recorded `method` request: a transaction, a call or a bundle. */
export const requestsOf = (calls: readonly RecordedCall[], method: string) =>
  Arr.flatMap(calls, (call): Record<PropertyKey, unknown>[] =>
    call.method === method ? [recordOf(paramsOf(call.params)[0])] : [],
  );
