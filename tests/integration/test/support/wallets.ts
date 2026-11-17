import { Context, Effect, Layer } from "effect";

import { Chain, ChainError, Devnet } from "@ensforge/test-devnet";
import {
  custom,
  http,
  numberToHex,
  type Address,
  type EIP1193RequestFn,
  type Hash,
  type Hex,
} from "viem";

/** How a test wallet behaves. */
export type WalletOptions = {
  /** Answer EIP-5792 (`wallet_sendCalls`) with atomic bundles, as smart wallets do. */
  readonly atomic?: boolean | undefined;
  /** Reject every signing request, as a user who clicks "reject". */
  readonly reject?: boolean | undefined;
  /** Sign this many requests, then reject the rest (an interrupted plan). */
  readonly rejectAfter?: number | undefined;
};

/** An EIP-1193 wallet for one devnet account, and the JSON-RPC methods it was asked for. */
export type TestWallet = {
  readonly transport: ReturnType<typeof custom>;
  readonly methods: readonly string[];
  /** Whether the wallet was asked to sign or send anything. */
  readonly prompted: () => boolean;
};

type Call = { readonly to: Address; readonly data?: Hex; readonly value?: Hex };
type Bundle = { readonly hashes: readonly Hash[]; readonly ok: boolean };

const signing = new Set(["eth_sendTransaction", "wallet_sendCalls", "eth_signTypedData_v4"]);

// An EIP-1193 error a wallet answers with: 4001 rejected, -32601 unsupported, 5730 unknown bundle.
const walletError = (code: number, message: string) => Object.assign(new Error(message), { code });

/** Test wallets over the devnet's unlocked accounts. */
export class Wallets extends Context.Service<
  Wallets,
  { readonly make: (account: Address, options?: WalletOptions) => TestWallet }
>()("@ensforge/test-integration/Wallets") {
  static readonly layer = Layer.effect(
    Wallets,
    Effect.gen(function* () {
      const devnet = yield* Devnet;
      const chain = yield* Chain;
      const node = http(devnet.rpcUrl)({ chain: devnet.chain });
      const forward = (method: string, params?: unknown) =>
        Effect.tryPromise({
          try: () => node.request({ method, params } as never) as Promise<unknown>,
          catch: (cause) => new ChainError({ method, cause }),
        });

      const make = (account: Address, options: WalletOptions = {}): TestWallet => {
        const methods: string[] = [];
        const bundles = new Map<string, Bundle>();

        // anvil has no EIP-5792: a bundle's calls run in order inside a snapshot, stop at the
        // first revert, and are all reverted if one fails.
        const sendBundle = Effect.fnUntraced(function* (calls: readonly Call[]) {
          const snapshot = yield* forward("evm_snapshot");
          const hashes: Hash[] = [];
          for (const call of calls) {
            const hash = (yield* forward("eth_sendTransaction", [
              { from: account, to: call.to, data: call.data, value: call.value },
            ])) as Hash;
            hashes.push(hash);
            if ((yield* chain.receipt(hash)).status === "success") continue;

            yield* forward("evm_revert", [snapshot]);
            return { hashes: [], ok: false } satisfies Bundle;
          }
          return { hashes, ok: true } satisfies Bundle;
        });

        const handle = Effect.fnUntraced(function* (method: string, params: readonly unknown[]) {
          methods.push(method);
          const signed = methods.filter((asked) => signing.has(asked)).length;
          const refused =
            options.reject === true ||
            (options.rejectAfter !== undefined && signed > options.rejectAfter);
          if (refused && signing.has(method)) {
            return yield* Effect.fail(walletError(4001, "User rejected the request."));
          }

          switch (method) {
            case "eth_accounts":
            case "eth_requestAccounts":
              return [account];
            case "wallet_getCapabilities":
              if (options.atomic !== true) {
                return yield* Effect.fail(walletError(-32601, "Method not found"));
              }
              return { [numberToHex(devnet.chain.id)]: { atomic: { status: "supported" } } };
            case "wallet_sendCalls": {
              if (options.atomic !== true) {
                return yield* Effect.fail(walletError(-32601, "Method not found"));
              }
              const [{ calls }] = params as readonly [{ readonly calls: readonly Call[] }];
              const id = `0x${(bundles.size + 1).toString(16).padStart(64, "0")}`;
              bundles.set(id, yield* sendBundle(calls));
              return { id };
            }
            case "wallet_getCallsStatus": {
              const [id] = params as readonly [string];
              const bundle = bundles.get(id);
              if (bundle === undefined) {
                return yield* Effect.fail(walletError(5730, "Unknown bundle"));
              }
              return {
                version: "2.0.0",
                id,
                chainId: numberToHex(devnet.chain.id),
                atomic: true,
                status: bundle.ok ? 200 : 500,
                receipts: yield* Effect.forEach(bundle.hashes, (hash) =>
                  forward("eth_getTransactionReceipt", [hash]),
                ),
              };
            }
            default:
              return yield* forward(method, params);
          }
        });

        // viem calls the wallet through Promises; this is the one place they appear.
        const request = (({ method, params }: { method: string; params?: unknown }) =>
          Effect.runPromise(
            handle(method, (params ?? []) as readonly unknown[]),
          )) as EIP1193RequestFn;

        return {
          transport: custom({ request }),
          methods,
          prompted: () => methods.some((method) => signing.has(method)),
        };
      };

      return Wallets.of({ make });
    }),
  );
}
