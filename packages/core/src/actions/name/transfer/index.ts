import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Sends a name to another account and resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to give a name away or move it between your own accounts. Use {@link transferSync} to wait
 * for the receipt.
 *
 * **Details**
 *
 * - ENSv2 names move their registry token. With `unsafe`, the transfer also succeeds while other
 *   accounts still hold roles on the name.
 * - Wrapped ENSv1 names move their NameWrapper token.
 * - Unwrapped `.eth` names: `role: "owner"` (default) moves the registrar token and the registry
 *   ownership (manager); `role: "registrant"` moves only the registrar token.
 * - Other unwrapped ENSv1 names change their registry owner.
 *
 * **Gotchas**
 *
 * - Expired, reserved and unregistered names cannot be transferred.
 * - ENSv2: roles on the name's PermissionedResolver stay with the sender, who can still edit its
 *   records (the plan carries a `RECORD_CONTROL_RETAINED` warning). `records: "handover"` grants
 *   them to the recipient and revokes the sender's in the same step; it is refused for the
 *   sender's shared `"owned"` resolver, whose roles cover other names.
 *
 * **Example** (Sending a name)
 *
 * ```ts
 * const { hash } = await ens.name.transfer({ name: "alice.eth", to: "0xB0b0000000000000000000000000000000000000" })
 * ```
 *
 * **Example** (Moving only the registrar token)
 *
 * ```ts
 * import { Actions } from "@ensforge/core"
 *
 * await Actions.name.transfer(ens, { name: "alice.eth", to: bob, role: "registrant" })
 * ```
 *
 * **Example** (Sending in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/core/effect"
 *
 * const { hash } = yield* Actions.name.transfer(ens, { name: "alice.eth", to: bob })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_RESERVED`, `NAME_NOT_REGISTERED`) when the name cannot be sent.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`, `TRANSFER_DISALLOWED`) when the account may not send it.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for `role: "registrant"` on names without a registrant.
 * @throws `Errors.UserRejectedError` when the user rejects the request.
 *
 * @see {@link Actions.name.get} to read the current owner
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function transfer(
  client: Like,
  options: transfer.Options & Write.Options,
): Promise<transfer.ReturnType> {
  return Action.promise("name.transfer", Impl.transfer, client, options);
}

export declare namespace transfer {
  /** Options for {@link transfer}. */
  type Options = {
    /** Name to send. Normalized automatically. */
    name: string;
    /** Recipient address. */
    to: string;
    /**
     * For unwrapped `.eth` names: `owner` moves the registrar token and the manager,
     * `registrant` moves only the registrar token.
     *
     * @default "owner"
     */
    role?: "owner" | "registrant" | undefined;
    /**
     * ENSv2 only: transfer even while other accounts hold roles on the name.
     *
     * @default false
     */
    unsafe?: boolean | undefined;
    /**
     * ENSv2: what happens to the sender's roles on the name's PermissionedResolver.
     *
     * @default "keep"
     */
    records?: "keep" | "handover" | undefined;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link transfer} can fail with. */
  type ErrorType = AnyError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
transfer.prepare = Action.promiseOf(
  "name.transfer.prepare",
  Impl.transferMethods.prepare,
) as Write.Method<transfer.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
transfer.simulate = Action.promiseOf(
  "name.transfer.simulate",
  Impl.transferMethods.simulate,
) as Write.Method<transfer.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
transfer.estimateGas = Action.promiseOf(
  "name.transfer.estimateGas",
  Impl.transferMethods.estimateGas,
) as Write.Method<transfer.Options, Plan.Estimate>;

/**
 * Sends a name to another account and resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the new owner being on-chain.
 *
 * **Example** (Sending and waiting)
 *
 * ```ts
 * const { receipt } = await ens.name.transferSync({ name: "alice.eth", to: bob })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/core"
 *
 * await Actions.name.transferSync(ens, { name: "alice.eth", to: bob })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/core/effect"
 *
 * yield* Actions.name.transferSync(ens, { name: "alice.eth", to: bob })
 * ```
 *
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_RESERVED`, `NAME_NOT_REGISTERED`) when the name cannot be sent.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`, `TRANSFER_DISALLOWED`) when the account may not send it.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link transfer} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function transferSync(
  client: Like,
  options: transferSync.Options,
): Promise<transferSync.ReturnType> {
  return Action.promise("name.transferSync", Impl.transferSync, client, options);
}

export declare namespace transferSync {
  /** Options for {@link transferSync}. */
  type Options = transfer.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link transferSync} can fail with. */
  type ErrorType = AnyError;
}
