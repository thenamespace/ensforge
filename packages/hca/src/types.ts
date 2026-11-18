import type { HcaSessionTerms } from "@ensforge/contracts/v2/experimental/hca";
import type { Plan, Write } from "@ensforge/sdk";
import type { Address, Hex } from "viem";

/**
 * A reason an address is not a usable HCA of its owner (HCA.md's checks).
 *
 * @stability experimental
 * @category hca
 * @since 1.0.0
 */
export type HcaProblem =
  | "address-mismatch"
  | "owner-unavailable"
  | "owner-mismatch"
  | "unknown-account"
  | "untrusted-implementation"
  | "not-certified";

/**
 * An ENS Hosted Contract Account, deployed or predicted.
 *
 * @stability experimental
 * @category hca
 * @since 1.0.0
 */
export type HcaAccount = {
  readonly address: Address;
  /** The immutable owner (the wallet); `null` when it cannot be read. */
  readonly owner: Address | null;
  readonly deployed: boolean;
  /** Owner the factory certified for this account. */
  readonly authorizedOwner: Address | null;
  /** `accountId()`, e.g. `ens-standalone-hca.1.1.0`. */
  readonly accountId: string | null;
  /** Current implementation; `null` before deployment. */
  readonly implementation: Address | null;
  /** Implementation the address derives from; it never changes. */
  readonly initialImplementation: Address;
  /** Increments with `revokeSessions`, invalidating every session approval. */
  readonly sessionNonce: bigint;
  /** DAO set of implementations this account may upgrade to. */
  readonly upgradeSet: Address;
  /** Failed checks; empty for a usable (or not yet deployed) HCA. */
  readonly problems: readonly HcaProblem[];
};

/**
 * A session the HCA owner approved: a key that may register names and edit one resolver's
 * records through Rhinestone without further prompts. Store it; it holds no secret.
 *
 * @stability experimental
 * @category hca
 * @since 1.0.0
 */
export type HcaSession = {
  readonly chainId: number;
  readonly hca: Address;
  readonly owner: Address;
  /** Public address of the session key; the key itself stays with the app. */
  readonly sessionKey: Address;
  readonly terms: HcaSessionTerms;
  readonly permissionId: Hex;
  /** This chain's session digest. */
  readonly sessionDigest: Hex;
  /** Every chain and digest the owner signed, this chain first. */
  readonly chains: readonly { readonly chainId: number; readonly sessionDigest: Hex }[];
  /** The owner's signature over the multi-chain approval. */
  readonly ownerSignature: Hex;
  /** EIP-712 domain the approval was signed under. */
  readonly signingDomain: "smart-session" | "hca";
};

/**
 * What an executor is asked to run: owner-authorized (or session-authorized) calls from the HCA.
 *
 * @stability experimental
 * @category executors
 * @since 1.0.0
 */
export type ExecutionRequest = {
  readonly chainId: number;
  readonly hca: Address;
  readonly owner: Address;
  readonly deployed: boolean;
  readonly calls: readonly Plan.Call[];
  readonly session?: HcaSession | undefined;
  readonly description: string;
};

/**
 * Runs HCA executions: the owner's wallet (`owner()`), an ERC-4337 bundler (`bundler()`,
 * `pimlico()`), Rhinestone intents (`rhinestone()`), or your own (`defineExecutor`).
 *
 * @stability experimental
 * @category executors
 * @since 1.0.0
 */
export type Executor = {
  readonly id: string;
  readonly capabilities: {
    /** Runs session-authorized executions (no owner prompt). */
    readonly sessions: boolean;
    /** Can run without the owner holding native gas. */
    readonly sponsorship: boolean;
    /** Deploys the HCA on first use, without a separate transaction. */
    readonly deploys: boolean;
  };
  /**
   * Sends one execution and returns a reference to follow it. Omitted for `owner()`, whose
   * executions are ordinary wallet transactions.
   */
  readonly send?:
    | ((request: ExecutionRequest, context: Write.Via.Context) => Promise<string>)
    | undefined;
  /** Where a sent execution is. */
  readonly status?:
    | ((reference: string, context: Write.Via.Context) => Promise<Write.Via.Status>)
    | undefined;
  /** Fees the executor will charge for a request, shown on the plan before sending. */
  readonly quote?:
    | ((request: ExecutionRequest, context: Write.Via.Context) => Promise<readonly Plan.Fee[]>)
    | undefined;
};
