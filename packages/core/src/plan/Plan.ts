import type { Address, Hex } from "viem";

import type { AnyError } from "../errors/types.js";
import { merge } from "./merge.js";
import { deserialize, serialize } from "./serialize.js";
import { localStorage, memoryStorage } from "./storage.js";

/**
 * A write, fully planned but not sent: the calls to make, in which order, and what they need.
 * Plans are plain data, so they can be inspected, serialized, merged or handed to viem.
 *
 * **Example** (Inspecting a plan)
 *
 * ```ts
 * const plan = await ens.record.set.prepare({ name: "alice.eth", texts: { url: "https://alice.dev" } })
 * plan.calls // send with ensforge, or with viem's sendCalls
 * ```
 *
 * @category plans
 * @since 1.0.0
 */
export interface Plan {
  /** Random identifier, used to save and resume the plan. */
  readonly id: string;
  /** Action that built the plan, e.g. `record.set`. */
  readonly operation: string;
  readonly chainId: number;
  /** Account the plan was prepared for. */
  readonly account: Address | undefined;
  /** Steps in order. Most writes have one step; registration waits between two. */
  readonly steps: readonly Plan.Step[];
  /** Every call of every step, flattened in order. */
  readonly calls: readonly Plan.Call[];
  /** What the account needs before sending, e.g. a balance or a token approval. */
  readonly requirements: readonly Plan.Requirement[];
  /** Non-blocking notes for the user, e.g. that a resolver is not a public resolver. */
  readonly warnings: readonly Plan.Warning[];
}

export declare namespace Plan {
  /** One contract call. */
  type Call = {
    readonly to: Address;
    readonly data: Hex;
    readonly value: bigint;
  };

  /** A group of calls sent together, optionally after a wait. */
  type Step = {
    readonly id: string;
    /** Short description for progress UIs, e.g. "Set records". */
    readonly description: string;
    readonly calls: readonly Call[];
    /** Wait before sending this step, e.g. the registration commitment age. */
    readonly waitFor?: { readonly seconds: bigint } | undefined;
  };

  /** Something the account must have before the plan can succeed. */
  type Requirement =
    | { readonly kind: "balance"; readonly amount: bigint; readonly token?: Address | undefined }
    | {
        readonly kind: "approval";
        readonly token: Address;
        readonly spender: Address;
        readonly amount: bigint;
      };

  /** A non-blocking note about the plan. */
  type Warning = { readonly code: string; readonly message: string };

  /** Result of simulating every call. */
  type Simulation = {
    readonly ok: boolean;
    readonly plan: Plan;
    readonly steps: readonly {
      readonly id: string;
      readonly ok: boolean;
      readonly error?: AnyError | undefined;
    }[];
  };

  /** Gas and ETH a plan needs. */
  type Estimate = {
    readonly plan: Plan;
    /** Total gas across all calls. */
    readonly gas: bigint;
    /** Total ETH sent across all calls. */
    readonly value: bigint;
  };

  /** Progress of a plan being sent. */
  type Event = {
    readonly step: Step;
    readonly status: "waiting" | "submitted" | "confirmed" | "failed";
    readonly hash?: Hex | undefined;
  };

  /** A saved plan and its progress, for resuming after a reload. */
  type Record = {
    readonly plan: Plan;
    readonly status: "pending" | "completed" | "failed";
    /** Transaction hash per submitted step id. */
    readonly submitted: Readonly<globalThis.Record<string, Hex>>;
    /** Unix time in milliseconds. */
    readonly updatedAt: number;
  };

  /** Where saved plans live. */
  type Storage = {
    readonly get: (id: string) => Promise<Record | undefined>;
    readonly set: (record: Record) => Promise<void>;
    readonly delete: (id: string) => Promise<void>;
    readonly list: () => Promise<readonly Record[]>;
  };
}

/**
 * Helpers for write plans: combine, save and restore them.
 *
 * @category plans
 * @since 1.0.0
 */
export const Plan = { merge, serialize, deserialize, memoryStorage, localStorage } as const;
