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
import { recordResource, type PermissionFacts } from "./facts.js";
import { recordRoles } from "./records.js";

type Requirement = UnauthorizedError.Requirement;

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
      return data.parts.isEth2ld ? allow("anyone", null) : role("renew");
    case "setTtl":
    case "setManager":
    case "reclaim":
      return blocked(
        "unsupported",
        `ENSv2 names have no ${operation === "setTtl" ? "TTL" : "manager"}.`,
      );
  }
};

/** Wrapped ENSv1: the NameWrapper owner or approved accounts, limited by burned fuses. */
const evaluateWrapped = (
  facts: PermissionFacts,
  operation: NameOperation,
  wrapper: Address,
): PermissionCheck => {
  const { state, data } = facts.loaded;
  const fuses = data.v1?.wrapper.fuses ?? 0;
  const authority = ownerAuthority(
    facts.account,
    state.owner,
    facts.v1.wrapperOperator,
    facts.v1.wrapperApproved,
  );
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
      if (data.parts.isEth2ld) return allow("anyone", null);
      // Wrapped subnames are extended by the parent, or by their owner with canExtendExpiry.
      return Fuse.has(fuses, "canExtendExpiry")
        ? byOwner(authority, wrapper, state.owner)
        : blocked(
            "unsupported",
            "The parent extends it (subname.update), or its owner with canExtendExpiry.",
            wrapper,
          );
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
 * nothing but renewing `.eth` names in their grace period.
 */
export const evaluate = (
  facts: PermissionFacts,
  operation: Operation,
  contracts:
    | { readonly registry: Address; readonly baseRegistrar: Address; readonly nameWrapper: Address }
    | undefined,
): PermissionCheck => {
  const { state } = facts.loaded;
  if (state.status !== "registered" && !(state.status === "grace" && operation === "renew")) {
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
