import type { Account, Address, BlockTag, Hex, TransactionReceipt } from "viem";

import type { Client, Like, ViemClient, ViemWalletClient } from "./client/types.js";
import type { Plan } from "./plan/Plan.js";

declare const requestValue: unique symbol;
declare const requestError: unique symbol;

/**
 * A deferred read built with `action.request(options)`, run later by `Actions.batch`.
 * Plain data; the type parameters only carry the result types.
 *
 * @category types
 * @since 1.0.0
 */
export interface Request<value = unknown, error = unknown> {
  /** Action path, e.g. `record.getText`. */
  readonly path: string;
  readonly options: unknown;
  readonly [requestValue]?: value;
  readonly [requestError]?: error;
}

/**
 * Options shared by read actions.
 *
 * @category types
 * @since 1.0.0
 */
export declare namespace Read {
  type Options = {
    /** Cancels the call; the Promise rejects with `signal.reason`. */
    signal?: AbortSignal | undefined;
    /**
     * Throw `NotFoundError` instead of returning `null` for missing data.
     *
     * @default false
     */
    strict?: boolean | undefined;
    /** CCIP-Read gateways for this call, overriding the client's. */
    gatewayUrls?: readonly string[] | undefined;
  } & BlockOptions;

  /** Read at one block, by number or by tag, never both. */
  type BlockOptions =
    | {
        /** Block number to read at. */
        blockNumber?: bigint | undefined;
        blockTag?: undefined;
      }
    | {
        blockNumber?: undefined;
        /**
         * Block tag to read at.
         *
         * @default the client's `config.blockTag`
         */
        blockTag?: BlockTag | undefined;
      };
}

/**
 * Options and results shared by write actions.
 *
 * @category types
 * @since 1.0.0
 */
export declare namespace Write {
  /**
   * How a plan's calls are sent: `batch` uses one EIP-5792 wallet call, `sequential` sends one
   * transaction per call, `auto` batches when the wallet supports atomic batches.
   */
  type Mode = "auto" | "batch" | "sequential";

  type Options = {
    /**
     * Signer for this write.
     *
     * @default the client's `account`
     */
    account?: Account | Address | undefined;
    /**
     * Simulate every call before the wallet prompt, so reverts become typed errors first.
     *
     * @default the client's `config.simulate`
     */
    simulate?: boolean | undefined;
    /** Cancels before the next wallet prompt; already submitted transactions are not undone. */
    signal?: AbortSignal | undefined;
    /**
     * How calls are sent.
     *
     * @default "auto"
     */
    mode?: Mode | undefined;
    /**
     * Most calls per wallet bundle. Consecutive steps share a bundle when the wallet supports
     * atomic batches, up to this many calls and never across a chain-time wait.
     *
     * @default 10
     */
    maxBundleCalls?: number | undefined;
    /** Called as each step waits, is submitted, confirmed or fails. */
    onStep?: ((event: Plan.Event) => void) | undefined;
    /**
     * Send the write another way than the signer's own transactions, e.g. through a smart account
     * (`hca()` from `@ensforge/hca`). Also applies to `.prepare`, `.simulate` and `.estimateGas`.
     */
    via?: Via | undefined;
    /**
     * EIP-5792 paymaster service for wallets that support it (`paymasterService` capability), so the
     * wallet's calls are sponsored. Sends through `wallet_sendCalls` even for one call.
     */
    paymaster?:
      | { readonly url: string; readonly context?: Readonly<Record<string, unknown>> }
      | undefined;
  };

  /**
   * A route for writes: rewrites a plan (e.g. into smart-account executions) and, optionally, sends
   * its steps itself (a bundler, an intent network). Without `send`, the signer sends the rewritten
   * plan as usual. Built by extension packages; resumable through `plan.resume` like any write.
   */
  type Via = {
    /** Shown in progress and errors, e.g. `hca`. */
    readonly id: string;
    /**
     * Account the plan's calls run as (`msg.sender`), when it is not the signer. Writes that deploy
     * contracts or grant roles plan for it (e.g. migration through an HCA).
     */
    readonly sender?: ((context: Via.Context) => Promise<Address>) | undefined;
    /**
     * Rewrites the plan before it is simulated or sent; the plan's id stays the same. Steps marked
     * `from: "signer"` must stay transactions of the signer.
     */
    readonly prepare?: ((plan: Plan, context: Via.Context) => Promise<Plan>) | undefined;
    /** Sends one step and returns a reference to follow it, e.g. a UserOperation hash. */
    readonly send?: ((step: Plan.Step, context: Via.Context) => Promise<string>) | undefined;
    /** Outcome of a step sent with `send`. */
    readonly status?:
      | ((reference: string, context: Via.Context) => Promise<Via.Status>)
      | undefined;
  };

  namespace Via {
    /** What a route knows about the write it carries. */
    type Context = {
      /** The ensforge client the write runs on (deployment, reads). */
      readonly client: Client<object>;
      readonly chainId: number;
      /** Signer of the write. */
      readonly account: Address | undefined;
      readonly publicClient: ViemClient;
      /** The signer's wallet, when one is configured. */
      readonly walletClient: ViemWalletClient | undefined;
    };

    /** Where a sent step is: still pending, mined (with its transactions), or failed. */
    type Status =
      | { readonly status: "pending" }
      | { readonly status: "success"; readonly hashes: readonly Hex[] }
      | { readonly status: "failed"; readonly reason: string; readonly hashes?: readonly Hex[] };
  }

  type SyncOptions = Options & {
    /**
     * Confirmations to wait for per transaction.
     *
     * @default 1
     */
    confirmations?: number | undefined;
    /** Milliseconds to wait for each receipt before failing with `RECEIPT_TIMEOUT`. */
    timeout?: number | undefined;
  };

  /** A write's `.prepare`, `.simulate` or `.estimateGas`: options plus `account` and `via`. */
  type Method<options, value> = (
    client: Like,
    options: options & Pick<Options, "account" | "via">,
  ) => Promise<value>;

  /** Returned by every write: resolves once every call is submitted. */
  type Result = {
    /** Hash of the last transaction. */
    readonly hash: Hex;
    /** Every submitted transaction, in order. */
    readonly hashes: readonly Hex[];
    /** EIP-5792 bundle id when the calls were sent as one batch. */
    readonly id: string | undefined;
    readonly plan: Plan;
  };

  /** Returned by every `…Sync` write: resolves once every receipt is in. */
  type SyncResult = Result & {
    /** Receipt of the last transaction. */
    readonly receipt: TransactionReceipt;
    readonly receipts: readonly TransactionReceipt[];
  };
}
