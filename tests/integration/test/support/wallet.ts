import type { DevnetInstance } from "@ensforge/test-devnet";
import {
  custom,
  http,
  numberToHex,
  type Address,
  type EIP1193RequestFn,
  type Hash,
  type Hex,
} from "viem";

/** How the test wallet behaves. */
export type WalletOptions = {
  /** Answer EIP-5792 (`wallet_sendCalls`) with atomic bundles, as smart wallets do. */
  readonly atomic?: boolean | undefined;
  /** Reject every signing request, as a user who clicks "reject". */
  readonly reject?: boolean | undefined;
  /** Sign this many requests, then reject the rest (an interrupted plan). */
  readonly rejectAfter?: number | undefined;
};

/** A wallet for `account` on the devnet, and the JSON-RPC methods it has been asked for. */
export type TestWallet = {
  readonly transport: ReturnType<typeof custom>;
  readonly methods: readonly string[];
  /** Whether the wallet was asked to sign or send anything. */
  readonly prompted: () => boolean;
};

const signing = new Set(["eth_sendTransaction", "wallet_sendCalls", "eth_signTypedData_v4"]);

type Call = { readonly to: Address; readonly data?: Hex; readonly value?: Hex };

/**
 * A wallet transport over the devnet's unlocked accounts. anvil has no EIP-5792, so with `atomic`
 * it sends a bundle's calls one by one inside a snapshot and reverts them all if one fails.
 */
export const testWallet = (
  devnet: DevnetInstance,
  account: Address,
  options: WalletOptions = {},
): TestWallet => {
  const node = http(devnet.rpcUrl)({ chain: devnet.chain });
  const methods: string[] = [];
  const bundles = new Map<string, { readonly hashes: readonly Hash[]; readonly ok: boolean }>();

  const send = (call: Call) =>
    node.request({
      method: "eth_sendTransaction",
      params: [{ from: account, to: call.to, data: call.data, value: call.value }],
    }) as Promise<Hash>;
  // The devnet mines asynchronously: a receipt exists only once the transaction is in a block.
  const receipt = (hash: Hash) => devnet.client.waitForTransactionReceipt({ hash });

  // A bundle's calls run in order and stop at the first revert.
  const sendInOrder = async (
    calls: readonly Call[],
    hashes: readonly Hash[] = [],
  ): Promise<{ readonly hashes: readonly Hash[]; readonly ok: boolean }> => {
    const [call, ...rest] = calls;
    if (call === undefined) return { hashes, ok: true };
    const hash = await send(call);
    if ((await receipt(hash)).status !== "success") return { hashes: [...hashes, hash], ok: false };
    return sendInOrder(rest, [...hashes, hash]);
  };

  const request = (async ({ method, params }: { method: string; params?: unknown }) => {
    methods.push(method);
    const signed = methods.filter((asked) => signing.has(asked)).length;
    const refused =
      options.reject === true ||
      (options.rejectAfter !== undefined && signed > options.rejectAfter);
    if (refused && signing.has(method)) {
      throw Object.assign(new Error("User rejected the request."), { code: 4001 });
    }
    const args = (params ?? []) as readonly unknown[];
    switch (method) {
      case "eth_accounts":
      case "eth_requestAccounts":
        return [account];
      case "wallet_getCapabilities": {
        if (options.atomic !== true) {
          throw Object.assign(new Error("Method not found"), { code: -32601 });
        }
        return { [numberToHex(devnet.chain.id)]: { atomic: { status: "supported" } } };
      }
      case "wallet_sendCalls": {
        if (options.atomic !== true) {
          throw Object.assign(new Error("Method not found"), { code: -32601 });
        }
        const [{ calls }] = args as readonly [{ readonly calls: readonly Call[] }];
        const snapshot = (await node.request({ method: "evm_snapshot" } as never)) as Hex;
        const { hashes, ok } = await sendInOrder(calls);
        if (!ok) await node.request({ method: "evm_revert", params: [snapshot] } as never);
        const id = `0x${(bundles.size + 1).toString(16).padStart(64, "0")}`;
        bundles.set(id, { hashes: ok ? hashes : [], ok });
        return { id };
      }
      case "wallet_getCallsStatus": {
        const [id] = args as readonly [string];
        const bundle = bundles.get(id);
        if (bundle === undefined) throw Object.assign(new Error("Unknown bundle"), { code: 5730 });
        return {
          version: "2.0.0",
          id,
          chainId: numberToHex(devnet.chain.id),
          atomic: true,
          status: bundle.ok ? 200 : 500,
          receipts: await Promise.all(
            bundle.hashes.map((hash) =>
              node.request({ method: "eth_getTransactionReceipt", params: [hash] }),
            ),
          ),
        };
      }
      default:
        return node.request({ method, params } as never);
    }
  }) as EIP1193RequestFn;

  return {
    transport: custom({ request }),
    methods,
    prompted: () => methods.some((method) => signing.has(method)),
  };
};
