import { Effect, Array as Arr } from "effect";

import type { Address } from "viem";

import type { NameOperation, PermissionCheck } from "../../actions/permission/get/types.js";
import type { remove } from "../../actions/subname/remove/index.js";
import type { update } from "../../actions/subname/update/index.js";
import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import { isOpaqueRevert } from "../action/write.js";
import { loadSubname } from "../subname/load.js";
import { checkLoaded, expiringBeforeNextBlock, explainDenied } from "./check.js";
import { evaluateChildRewrite, evaluateSelfRemoval } from "./evaluate.js";
import { readPermissionFacts } from "./facts.js";

/** The account has the authority a denied check needs, and something else blocks it. */
const authorized = (check: PermissionCheck): boolean =>
  Arr.every(check.missing, (requirement) => requirement.type === "blocked");

/**
 * Explains a failed `subname.remove`: a parent expiring before the next block, else for an
 * opaque revert who may remove the child. The parent clears the child, or the child's holder
 * clears it: the account is denied only when both routes are, and the error names the route it
 * has authority on (blocked by a fuse or status), else the parent's.
 */
export const explainRemoval = Effect.fnUntraced(function* (
  client: Client,
  options: remove.Options,
  account: Address,
  error: AnyError,
): Effect.fn.Return<AnyError | undefined, AnyError> {
  const { parent, child } = yield* loadSubname(client, options.name);
  const expiring = expiringBeforeNextBlock(parent);
  if (expiring !== undefined || !isOpaqueRevert(error)) return expiring;

  const contracts = client.deployment.v1?.contracts;
  const facts = yield* Effect.all(
    {
      parent: readPermissionFacts(client, parent, account, []),
      child: readPermissionFacts(client, child, account, []),
    },
    { concurrency: "unbounded" },
  );

  const viaParent = evaluateChildRewrite(facts.parent, child, contracts);
  const viaChild = evaluateSelfRemoval(facts.child, contracts);
  if (viaParent.allowed !== false || viaChild.allowed !== false) return undefined;
  return explainDenied(
    [!authorized(viaParent) && authorized(viaChild) ? viaChild : viaParent],
    account,
  );
});

/**
 * Explains a failed `subname.update`: a parent expiring before the next block, else for an
 * opaque revert what the account lacks. ENSv2 children change their resolver and expiry with
 * roles on the child; ENSv1 owner and resolver changes are rewrites from the parent; a wrapped
 * child's expiry alone is extended through the NameWrapper (`renew`).
 */
export const explainUpdate = Effect.fnUntraced(function* (
  client: Client,
  options: update.Options,
  account: Address,
  error: AnyError,
): Effect.fn.Return<AnyError | undefined, AnyError> {
  const { parent, child } = yield* loadSubname(client, options.name);
  const expiring = expiringBeforeNextBlock(parent);
  if (expiring !== undefined || !isOpaqueRevert(error)) return expiring;

  const rewrite = options.owner !== undefined || options.resolver !== undefined;

  if (child.state.protocol === "v1" && rewrite) {
    const facts = yield* readPermissionFacts(client, parent, account, []);
    return explainDenied(
      [evaluateChildRewrite(facts, child, client.deployment.v1?.contracts)],
      account,
    );
  }
  const operations: NameOperation[] = [
    ...(options.resolver === undefined ? [] : ["setResolver" as const]),
    ...(options.expiry === undefined ? [] : ["renew" as const]),
  ];
  const checks = yield* checkLoaded(client, child, account, operations);
  return explainDenied(checks, account);
});
