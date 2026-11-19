import { Effect, Array as Arr, Option } from "effect";

import type { Address } from "viem";

import type { Operation, PermissionCheck } from "../../actions/permission/get/types.js";
import type { Client } from "../../client/types.js";
import { ConfigError } from "../../errors/classes/ConfigError.js";
import { NameStateError } from "../../errors/classes/NameStateError.js";
import { UnauthorizedError } from "../../errors/classes/UnauthorizedError.js";
import type { AnyError } from "../../errors/types.js";
import { isOpaqueRevert, type Explainer } from "../action/write.js";
import { loadName, type LoadedName } from "../name/load.js";
import type { L2Location } from "../name/location.js";
import { requireAddress } from "../name/write.js";
import type { RecordAccess } from "../namespace/l2/index.js";
import { evaluate } from "./evaluate.js";
import { readPermissionFacts } from "./facts.js";

/** Checks several operations for one account on a loaded name, sharing one round of reads. */
export const checkLoaded = Effect.fnUntraced(function* (
  client: Client,
  loaded: LoadedName,
  account: Address,
  operations: readonly Operation[],
): Effect.fn.Return<readonly PermissionCheck[], AnyError> {
  // A name in no ENS registry may live on an L2, where its namespace's rules apply.
  if (loaded.kind === "available") {
    const { l2LocationOf } = yield* Effect.promise(() => import("../name/location.js"));
    const location = yield* l2LocationOf(client, loaded.data.parts, {});
    if (location !== null) return yield* checkOnL2(client, location, loaded, account, operations);
  }

  const facts = yield* readPermissionFacts(client, loaded, account, operations);
  return Arr.map(operations, (operation) =>
    evaluate(facts, operation, client.deployment.v1?.contracts),
  );
});

const unsupportedOnL2: PermissionCheck = {
  allowed: false,
  via: null,
  contract: null,
  resource: null,
  missing: [
    {
      type: "blocked",
      reason: "unsupported",
      detail:
        "ensforge writes the records, owner and approvals of L2 names; their namespace manages the rest.",
    },
  ],
};

/**
 * Checks on a name in an L2 namespace, as its contracts authorize them on the L2: record writes,
 * and transfers (which approving the token takes too); everything else unsupported. Unknown
 * (`allowed: null`) when the client cannot reach the L2.
 */
const checkOnL2 = Effect.fnUntraced(function* (
  client: Client,
  location: L2Location,
  loaded: LoadedName,
  account: Address,
  operations: readonly Operation[],
): Effect.fn.Return<readonly PermissionCheck[], AnyError> {
  const { l2Client } = yield* Effect.promise(() => import("../name/location.js"));
  const l2 = yield* l2Client(client, location, false);
  const { parts } = loaded.data;
  const { recordAccess, transferAccess } = yield* Effect.promise(
    () => import("../namespace/l2/index.js"),
  );
  // Each access is read once, and only when an operation needs it.
  const accessFor = (
    test: (operation: Operation) => boolean,
    read: (l2: Client) => Effect.Effect<RecordAccess, AnyError>,
  ) => (l2 === null || !Arr.some(operations, test) ? Effect.undefined : read(l2));
  const [records, transfer] = yield* Effect.all(
    [
      accessFor(
        (operation) => typeof operation === "object",
        (on) => recordAccess(on, location, parts, account),
      ),
      accessFor(
        (operation) => operation === "transfer",
        (on) => transferAccess(on, location, parts, account),
      ),
    ],
    { concurrency: "unbounded" },
  );

  return Arr.map(operations, (operation): PermissionCheck => {
    if (typeof operation !== "object" && operation !== "transfer") return unsupportedOnL2;
    const access = typeof operation === "object" ? records : transfer;
    if (access === undefined) {
      return { allowed: null, via: null, contract: null, resource: null, missing: [] };
    }
    return {
      allowed: access.allowed,
      via: access.via,
      contract: access.contract,
      resource: null,
      missing:
        access.allowed || access.contract === null
          ? []
          : [{ type: "owner", contract: access.contract, owner: access.owner }],
    };
  });
});

/** Like {@link checkLoaded}, loading the name first. */
export const checkName = Effect.fnUntraced(function* (
  client: Client,
  name: string,
  account: Address,
  operations: readonly Operation[],
): Effect.fn.Return<readonly PermissionCheck[], AnyError> {
  const loaded = yield* loadName(client, name);
  return yield* checkLoaded(client, loaded, account, operations);
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
  const denied = Option.getOrUndefined(
    Arr.findFirst(
      checks,
      (check) =>
        check.allowed === false &&
        !Arr.some(
          check.missing,
          (requirement) =>
            requirement.type === "blocked" &&
            (requirement.reason === "status" || requirement.reason === "unsupported"),
        ),
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
    missingRoles: Arr.flatMap(denied.missing, (requirement) =>
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
      const checks = yield* checkLoaded(client, loaded, account, operationsOf(options));
      return explainDenied(checks, account);
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
