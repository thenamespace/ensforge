import { Effect } from "effect";

import type { Address } from "viem";

import type { Operation, PermissionCheck } from "../../actions/permission/get/types.js";
import type { Client } from "../../client/types.js";
import { ConfigError } from "../../errors/classes/ConfigError.js";
import { NameStateError } from "../../errors/classes/NameStateError.js";
import { UnauthorizedError } from "../../errors/classes/UnauthorizedError.js";
import type { AnyError } from "../../errors/types.js";
import { isOpaqueRevert, type Explainer } from "../action/write.js";
import { loadName, type LoadedName } from "../name/load.js";
import { requireAddress } from "../name/write.js";
import { evaluate } from "./evaluate.js";
import { readPermissionFacts } from "./facts.js";

/** Checks several operations for one account on a loaded name, sharing one round of reads. */
export const checkLoaded = Effect.fnUntraced(function* (
  client: Client,
  loaded: LoadedName,
  account: Address,
  operations: readonly Operation[],
): Effect.fn.Return<readonly PermissionCheck[], AnyError> {
  const facts = yield* readPermissionFacts(client, loaded, account, operations);
  return operations.map((operation) => evaluate(facts, operation, client.deployment.v1?.contracts));
});

/** Like {@link checkLoaded}, loading the name first. */
export const checkName = Effect.fnUntraced(function* (
  client: Client,
  name: string,
  account: Address,
  operations: readonly Operation[],
): Effect.fn.Return<readonly PermissionCheck[], AnyError> {
  return yield* checkLoaded(client, yield* loadName(client, name), account, operations);
});

/**
 * An `UnauthorizedError` for the first operation the account may not perform, or `undefined`
 * when the engine finds no permission problem (the failure has another cause). Name status and
 * unsupported operations are left to the original error.
 */
export const explainDenied = (
  checks: readonly PermissionCheck[],
  account: Address,
): UnauthorizedError | undefined => {
  const denied = checks.find(
    (check) =>
      check.allowed === false &&
      !check.missing.some(
        (requirement) =>
          requirement.type === "blocked" &&
          (requirement.reason === "status" || requirement.reason === "unsupported"),
      ),
  );
  if (denied === undefined) return undefined;

  const [first] = denied.missing;
  return new UnauthorizedError({
    code:
      first?.type === "roles"
        ? "MISSING_ROLES"
        : first?.type === "blocked"
          ? first.reason === "fuse"
            ? "FUSE_BURNED"
            : "TRANSFER_DISALLOWED"
          : "NOT_OWNER",
    account,
    missingRoles: denied.missing.flatMap((requirement) =>
      requirement.type === "roles" ? requirement.roles : [],
    ),
    requirements: denied.missing,
    ...(denied.contract === null ? {} : { context: { contract: denied.contract } }),
  });
};

// Writes are simulated in the block after the latest one: a name expiring within this many
// seconds of the latest block may already be expired there (12 s blocks on Ethereum).
const nextBlockWindow = 60n;

/** `NAME_EXPIRED` when `loaded` is live in the latest block but expires before the next one. */
export const expiringBeforeNextBlock = (loaded: LoadedName): NameStateError | undefined => {
  const { expiry } = loaded.state;
  const { now } = loaded.data;
  return expiry !== null && expiry > now && expiry - now <= nextBlockWindow
    ? new NameStateError({
        code: "NAME_EXPIRED",
        hint: "It expires before the transaction can be mined; renew it first.",
      })
    : undefined;
};

/**
 * An explainer for `Action.write`. A revert on a name that expires before the next block is
 * `NAME_EXPIRED`; an opaque revert becomes the first operation of `operationsOf(options)` on
 * `nameOf(options)` the signer may not perform, as an `UnauthorizedError`.
 */
export const explainFor =
  <options>(
    nameOf: (options: options) => string,
    operationsOf: (options: options) => readonly Operation[],
  ): Explainer<options> =>
  (client, options, account, error) =>
    Effect.gen(function* () {
      const loaded = yield* loadName(client, nameOf(options));
      const expiring = expiringBeforeNextBlock(loaded);
      if (expiring !== undefined || !isOpaqueRevert(error)) return expiring;
      return explainDenied(
        yield* checkLoaded(client, loaded, account, operationsOf(options)),
        account,
      );
    });

/** The account to check: the option, else the client's account. */
export const checkedAccount = (
  client: Client,
  account: string | undefined,
): Effect.Effect<Address, AnyError> =>
  account !== undefined
    ? requireAddress(account, "account")
    : client.account !== undefined
      ? Effect.succeed(client.account)
      : Effect.fail(
          new ConfigError({
            code: "WALLET_NOT_CONFIGURED",
            hint: "Pass `account` to check another account.",
          }),
        );
