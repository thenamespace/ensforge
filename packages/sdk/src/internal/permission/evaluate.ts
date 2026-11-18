import { Roles } from "@ensforge/contracts";
import type { Address } from "viem";

import type {
  Authority,
  NameOperation,
  Operation,
  PermissionCheck,
  RecordOperation,
} from "../../actions/permission/get/types.js";
import type { UnauthorizedError } from "../../errors/classes/UnauthorizedError.js";
import * as Fuse from "../../utils/Fuse.js";
import { sameAddress } from "../address.js";
import type { LoadedName } from "../name/load.js";
import { recordResource, type PermissionFacts } from "./facts.js";
import { recordRoles } from "./records.js";

type Requirement = UnauthorizedError.Requirement;

type Contracts = {
  readonly registry: Address;
  readonly baseRegistrar: Address;
  readonly nameWrapper: Address;
};

const allow = (
  via: Authority,
  contract: Address | null,
  resource: bigint | null = null,
): PermissionCheck => ({
  allowed: true,
  via,
  contract,
  resource,
  missing: [],
});

const deny = (
  missing: readonly Requirement[],
  contract: Address | null,
  resource: bigint | null = null,
): PermissionCheck => ({ allowed: false, via: null, contract, resource, missing });

const blocked = (
  reason: Extract<Requirement, { type: "blocked" }>["reason"],
  detail: string,
  contract: Address | null = null,
): PermissionCheck => deny([{ type: "blocked", reason, detail }], contract);

/** Owner, operator or token-approved address, in that order of preference. */
const ownerAuthority = (
  account: Address,
  owner: Address | null,
  operator: boolean,
  approved: Address | null = null,
): Authority | null =>
  sameAddress(owner, account)
    ? "owner"
    : operator
      ? "operator"
      : sameAddress(approved, account)
        ? "approved"
        : null;

const byOwner = (
  authority: Authority | null,
  contract: Address,
  owner: Address | null,
): PermissionCheck =>
  authority === null
    ? deny([{ type: "owner", contract, owner }], contract)
    : allow(authority, contract);

/** Allowed when `held` includes `role`, otherwise missing `name` on `resource` of `contract`. */
const byRole = (
  held: bigint,
  role: bigint,
  name: string,
  contract: Address,
  resource: bigint,
): PermissionCheck =>
  (held & role) === role
    ? allow("roles", contract, resource)
    : deny([{ type: "roles", contract, resource, roles: [name] }], contract, resource);

/** ENSv2: roles on the registry holding the name; transfers follow the ERC-1155 rules. */
const evaluateV2 = (facts: PermissionFacts, operation: NameOperation): PermissionCheck => {
  const { state, data } = facts.loaded;
  const registry = state.registry as Address;
  const resource = state.resource ?? 0n;
  const role = (name: keyof typeof Roles.registry): PermissionCheck =>
    byRole(facts.v2.roles, Roles.registry[name], name, registry, resource);

  switch (operation) {
    case "transfer": {
      // A token can only leave an owner holding `canTransferAdmin` on it.
      if ((facts.v2.ownerRoles & Roles.registry.canTransferAdmin) === 0n) {
        return blocked(
          "transfer-disallowed",
          "The owner lacks canTransferAdmin on the name.",
          registry,
        );
      }
      // Safe transfers wait until nobody holds unemancipated root roles on the registry.
      if (!facts.v2.registryEmancipated) {
        return blocked(
          "transfer-disallowed",
          "The registry is not emancipated; `name.transfer` with `unsafe: true` sends it anyway.",
          registry,
        );
      }
      // A safe transfer would leave other holders' roles in place (GHSA-hvjh), so it reverts.
      if (!facts.v2.ownerOnlyAssignee) {
        return blocked(
          "transfer-disallowed",
          "Other accounts hold roles on the name; `name.transfer` with `unsafe: true` sends it anyway.",
          registry,
        );
      }
      return byOwner(
        ownerAuthority(facts.account, state.owner, facts.v2.operator),
        registry,
        state.owner,
      );
    }
    case "setResolver":
    case "setSubregistry":
      return role(operation);
    case "createSubname": {
      const subregistry = state.subregistry;
      // Without a subregistry, a new one is attached first (subname.create does it).
      if (subregistry === null || facts.v2.subregistryRoles === null) return role("setSubregistry");
      return byRole(
        facts.v2.subregistryRoles,
        Roles.registry.registrar,
        "registrar",
        subregistry,
        0n,
      );
    }
    case "removeSubname": {
      const subregistry = state.subregistry;
      if (subregistry === null || facts.v2.subregistryRoles === null) {
        return blocked("unsupported", "The name has no subregistry, so no subnames.");
      }
      return byRole(
        facts.v2.subregistryRoles,
        Roles.registry.unregister,
        "unregister",
        subregistry,
        0n,
      );
    }
    case "renew":
      if (data.parts.isEth2ld) return allow("anyone", null);
      // An expired name is renewed (revived) only with `renew` at the registry's root, and
      // contracts-v2 #505's UserRegistry ignores `renew` held on the name altogether.
      return facts.v2.rootOnlyRenewal || facts.loaded.state.status === "expired"
        ? byRole(facts.v2.rootRoles, Roles.registry.renew, "renew", registry, 0n)
        : role("renew");
    case "setTtl":
    case "setManager":
    case "reclaim":
      return blocked(
        "unsupported",
        `ENSv2 names have no ${operation === "setTtl" ? "TTL" : "manager"}.`,
      );
  }
};

/**
 * NameWrapper `extendExpiry` of a wrapped subname: the parent's owner, operator or approved
 * account (unless a `.eth` parent is in grace), or the name's own owner or operator once
 * `canExtendExpiry` is burned.
 */
const evaluateWrappedRenewal = (facts: PermissionFacts, wrapper: Address): PermissionCheck => {
  const { state, data } = facts.loaded;
  const { account, v1 } = facts;
  if (v1.canExtendSubnames) {
    return allow(
      sameAddress(v1.parentOwner, account)
        ? "owner"
        : sameAddress(v1.parentApproved, account)
          ? "approved"
          : "operator",
      wrapper,
    );
  }
  if (Fuse.has(data.v1?.wrapper.fuses ?? 0, "canExtendExpiry") && v1.canModifyName) {
    return allow(sameAddress(state.owner, account) ? "owner" : "operator", wrapper);
  }
  if (sameAddress(v1.parentOwner, account)) {
    return blocked("status", "The parent is in its grace period.", wrapper);
  }
  return deny([{ type: "owner", contract: wrapper, owner: v1.parentOwner }], wrapper);
};

/**
 * Wrapped ENSv1: the NameWrapper owner or an operator, limited by burned fuses. A token-approved
 * account only extends the name's children.
 */
const evaluateWrapped = (
  facts: PermissionFacts,
  operation: NameOperation,
  wrapper: Address,
): PermissionCheck => {
  const { state, data } = facts.loaded;
  const fuses = data.v1?.wrapper.fuses ?? 0;
  const authority = ownerAuthority(facts.account, state.owner, facts.v1.wrapperOperator);
  const guarded = (fuse: Fuse.Name): PermissionCheck =>
    Fuse.has(fuses, fuse)
      ? blocked("fuse", `The ${fuse} fuse is burned.`, wrapper)
      : byOwner(authority, wrapper, state.owner);

  switch (operation) {
    case "transfer":
      return guarded("cannotTransfer");
    case "setResolver":
      return guarded("cannotSetResolver");
    case "setTtl":
      return guarded("cannotSetTtl");
    case "createSubname":
      return guarded("cannotCreateSubdomain");
    case "removeSubname":
      return byOwner(authority, wrapper, state.owner);
    case "renew":
      return data.parts.isEth2ld ? allow("anyone", null) : evaluateWrappedRenewal(facts, wrapper);
    case "setSubregistry":
    case "setManager":
    case "reclaim":
      return blocked("unsupported", "Wrapped ENSv1 names have no manager or subregistry.");
  }
};

/** Unwrapped ENSv1: the registry owner (manager) and, for `.eth` names, the registrant. */
const evaluateUnwrapped = (
  facts: PermissionFacts,
  operation: NameOperation,
  contracts: { readonly registry: Address; readonly baseRegistrar: Address },
): PermissionCheck => {
  const { state, data } = facts.loaded;
  const manager = data.v1?.registryOwner ?? null;
  const managerAuthority = ownerAuthority(facts.account, manager, facts.v1.registryOperator);
  const registrantAuthority = ownerAuthority(
    facts.account,
    state.registrant,
    facts.v1.registrarOperator,
    facts.v1.registrarApproved,
  );
  const asManager = byOwner(managerAuthority, contracts.registry, manager);
  const asRegistrant = byOwner(registrantAuthority, contracts.baseRegistrar, state.registrant);

  switch (operation) {
    case "transfer":
      return data.parts.isEth2ld ? asRegistrant : asManager;
    case "setResolver":
    case "setTtl":
    case "createSubname":
    case "removeSubname":
      return asManager;
    case "setManager":
      // The registrant reclaims to a new manager; the manager may hand it on directly.
      return data.parts.isEth2ld && asManager.allowed !== true ? asRegistrant : asManager;
    case "reclaim":
      return data.parts.isEth2ld
        ? asRegistrant
        : blocked("unsupported", "Only .eth names have a registrant.");
    case "renew":
      return data.parts.isEth2ld
        ? allow("anyone", null)
        : blocked("unsupported", "ENSv1 subnames do not expire.");
    case "setSubregistry":
      return blocked("unsupported", "ENSv1 names have no subregistry.");
  }
};

/** Records: PermissionedResolver roles, or owner / operator / delegate on node-based resolvers. */
const evaluateRecord = (facts: PermissionFacts, operation: RecordOperation): PermissionCheck => {
  const resolver = facts.resolver;
  if (resolver === undefined) return blocked("unsupported", "The name has no resolver.");

  if (resolver.kind === "permissioned") {
    if (operation.setRecord === "pubkey") {
      return blocked(
        "unsupported",
        "PermissionedResolvers do not store public keys.",
        resolver.address,
      );
    }
    const name = recordRoles[operation.setRecord];
    const resource = recordResource(operation);
    const held = resolver.rootRoles | (resolver.resourceRoles.get(resource) ?? 0n);
    return byRole(held, Roles.resolver[name], name, resolver.address, resource);
  }

  if (resolver.frozen) {
    return blocked(
      "unsupported",
      "The resolver is bound to the registry ENS replaced in 2020; its records cannot change.",
      resolver.address,
    );
  }
  if (!resolver.nameKnown) {
    return blocked(
      "unsupported",
      "PublicResolverV2 only serves names known to the NameWrapper.",
      resolver.address,
    );
  }
  // Resolvers without the PublicResolver approval functions have an unknown permission model.
  if (resolver.operator === undefined && resolver.delegate === undefined) {
    return { allowed: null, via: null, contract: resolver.address, resource: null, missing: [] };
  }
  const authority = sameAddress(resolver.owner, facts.account)
    ? "owner"
    : resolver.operator === true
      ? "operator"
      : resolver.delegate === true
        ? "delegate"
        : null;
  return byOwner(authority, resolver.address, resolver.owner);
};

/**
 * Whether the account in `facts` may perform `operation`. Names that are not registered allow
 * nothing but renewing `.eth` names in their grace period, expired ENSv2 subnames (revived with
 * `renew` at the registry's root), and expired wrapped subnames the NameWrapper still holds for
 * their owner (not emancipated).
 */
export const evaluate = (
  facts: PermissionFacts,
  operation: Operation,
  contracts: Contracts | undefined,
): PermissionCheck => {
  const { state, data } = facts.loaded;
  const renewable =
    operation === "renew" &&
    (state.status === "grace" ||
      (state.status === "expired" &&
        !data.parts.isEth2ld &&
        (state.protocol === "v2" || (state.wrapped && state.owner !== null))));
  if (state.status !== "registered" && !renewable) {
    return blocked("status", `The name is ${state.status}.`);
  }

  if (typeof operation !== "string") return evaluateRecord(facts, operation);
  if (state.protocol === "v2") return evaluateV2(facts, operation);
  if (contracts === undefined) {
    return blocked("unsupported", "The deployment has no ENSv1 contracts.");
  }
  return state.wrapped
    ? evaluateWrapped(facts, operation, contracts.nameWrapper)
    : evaluateUnwrapped(facts, operation, contracts);
};

/**
 * Whether the parent's account may rewrite or clear an existing child with `setSubnodeRecord`
 * (`subname.update`, `subname.remove`): it needs the parent's authority over children, and
 * through the NameWrapper the child must not be emancipated. An unwrapped parent rewrites any
 * child in the registry.
 */
export const evaluateChildRewrite = (
  parentFacts: PermissionFacts,
  child: LoadedName,
  contracts: Contracts | undefined,
): PermissionCheck => {
  const check = evaluate(parentFacts, "removeSubname", contracts);
  const throughWrapper =
    parentFacts.loaded.state.protocol === "v1" &&
    parentFacts.loaded.state.wrapped &&
    child.state.wrapped;
  return check.allowed === true &&
    throughWrapper &&
    Fuse.has(child.data.v1?.wrapper.fuses ?? 0, "parentCannotControl")
    ? blocked("fuse", "The child is emancipated (parentCannotControl).", check.contract)
    : check;
};

/**
 * Whether the account in `facts` may remove the name as its own holder (`subname.remove`
 * without the parent): ENSv2 `unregister` with the role on the name; a wrapped ENSv1 name's
 * owner or operator clears it through the NameWrapper unless a fuse forbids unwrapping or
 * changing its record; an unwrapped one's manager clears it in the registry.
 */
export const evaluateSelfRemoval = (
  facts: PermissionFacts,
  contracts: Contracts | undefined,
): PermissionCheck => {
  const { state, data } = facts.loaded;
  if (state.status !== "registered") return blocked("status", `The name is ${state.status}.`);
  if (state.protocol === "v2") {
    return byRole(
      facts.v2.roles,
      Roles.registry.unregister,
      "unregister",
      state.registry as Address,
      state.resource ?? 0n,
    );
  }
  if (contracts === undefined) {
    return blocked("unsupported", "The deployment has no ENSv1 contracts.");
  }

  if (!state.wrapped) {
    const manager = data.v1?.registryOwner ?? null;
    return byOwner(
      ownerAuthority(facts.account, manager, facts.v1.registryOperator),
      contracts.registry,
      manager,
    );
  }
  const fuses = data.v1?.wrapper.fuses ?? 0;
  const burned = (
    ["cannotUnwrap", "cannotTransfer", "cannotSetResolver", "cannotSetTtl"] as const
  ).find((fuse) => Fuse.has(fuses, fuse));
  return burned !== undefined
    ? blocked("fuse", `The ${burned} fuse is burned.`, contracts.nameWrapper)
    : byOwner(
        ownerAuthority(facts.account, state.owner, facts.v1.wrapperOperator),
        contracts.nameWrapper,
        state.owner,
      );
};
