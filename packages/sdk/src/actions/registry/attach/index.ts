import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Sets or removes the subregistry of an ENSv2 name. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to move a name's children to another registry, or to detach them. Use {@link attachSync} to wait for the receipt.
 *
 * **Details**
 *
 * - `setSubregistry` on the registry holding the name, then `setParent` on the new registry so
 *   its canonical name points back to the name (skip with `setParent: false`).
 * - `registry: null` detaches the current subregistry.
 *
 * **Example** (Attaching a registry)
 *
 * ```ts
 * const { hash } = await ens.registry.attach({ name: "alice.eth", registry: "0x02cA46F62f6C9F655364bf9Fd4f11Fb8f01C5753" })
 * ```
 *
 * **Example** (Attaching a registry with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.registry.attach(ens, { name: "alice.eth", registry: "0x02cA46F62f6C9F655364bf9Fd4f11Fb8f01C5753" })
 * ```
 *
 * **Example** (Attaching a registry in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.registry.attach(ens, { name: "alice.eth", registry: "0x02cA46F62f6C9F655364bf9Fd4f11Fb8f01C5753" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_NOT_REGISTERED`, `NAME_EXPIRED`) when the name is not registered.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for ENSv1 names.
 * @throws `Errors.UnauthorizedError` (`MISSING_ROLES`) when the account may not change it.
 * @throws `Errors.UserRejectedError` when the user rejects the request.
 *
 * @see {@link Actions.registry.get} to inspect it
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function attach(
  client: Like,
  options: attach.Options & Write.Options,
): Promise<attach.ReturnType> {
  return Action.promise("registry.attach", Impl.attach, client, options);
}

export declare namespace attach {
  /** Options for {@link attach}. */
  type Options = {
    /** ENSv2 name. Normalized automatically. */
    name: string;
    /** Registry to attach, or `null` to detach. */
    registry: string | null;
    /**
     * Also call `setParent` on the registry.
     *
     * @default true
     */
    setParent?: boolean | undefined;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link attach} can fail with. */
  type ErrorType = AnyError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
attach.prepare = Action.promiseOf(
  "registry.attach.prepare",
  Impl.attachMethods.prepare,
) as Write.Method<attach.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
attach.simulate = Action.promiseOf(
  "registry.attach.simulate",
  Impl.attachMethods.simulate,
) as Write.Method<attach.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
attach.estimateGas = Action.promiseOf(
  "registry.attach.estimateGas",
  Impl.attachMethods.estimateGas,
) as Write.Method<attach.Options, Plan.Estimate>;

/**
 * Sets or removes the subregistry of an ENSv2 name. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Attaching a registry and waiting)
 *
 * ```ts
 * const { receipt } = await ens.registry.attachSync({ name: "alice.eth", registry: "0x02cA46F62f6C9F655364bf9Fd4f11Fb8f01C5753" })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.registry.attachSync(ens, { name: "alice.eth", registry: "0x02cA46F62f6C9F655364bf9Fd4f11Fb8f01C5753" })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.registry.attachSync(ens, { name: "alice.eth", registry: "0x02cA46F62f6C9F655364bf9Fd4f11Fb8f01C5753" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_NOT_REGISTERED`, `NAME_EXPIRED`) when the name is not registered.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for ENSv1 names.
 * @throws `Errors.UnauthorizedError` (`MISSING_ROLES`) when the account may not change it.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link attach} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function attachSync(
  client: Like,
  options: attachSync.Options,
): Promise<attachSync.ReturnType> {
  return Action.promise("registry.attachSync", Impl.attachSync, client, options);
}

export declare namespace attachSync {
  /** Options for {@link attachSync}. */
  type Options = attach.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link attachSync} can fail with. */
  type ErrorType = AnyError;
}
