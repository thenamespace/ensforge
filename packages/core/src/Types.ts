import type { Account, Address, BlockTag, Hex, TransactionReceipt } from "viem";

import type { Like } from "./client/types.js";
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
  };

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

  /** A write's `.prepare`, `.simulate` or `.estimateGas`: options plus an optional `account`. */
  type Method<options, value> = (
    client: Like,
    options: options & Pick<Options, "account">,
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
