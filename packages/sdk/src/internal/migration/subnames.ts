import { Effect } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { migrationUserRegistrySalt } from "@ensforge/contracts/v2";
import {
  encodeFunctionData,
  getAddress,
  isAddressEqual,
  maxUint64,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";

import type { Client } from "../../client/types.js";
import { InvalidInputError } from "../../errors/classes/InvalidInputError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import * as Fuse from "../../utils/Fuse.js";
import { loadName, type LoadedName } from "../name/load.js";
import { deployUserRegistry, rootRoles } from "../registry/deploy.js";
import * as Rpc from "../rpc/index.js";

/** A subname that cannot be recreated, and why. */
export type LeftBehind = { readonly name: string; readonly reason: string };

/** How a migrating name's ENSv1 subnames are recreated on ENSv2. */
export type Recreation = {
  /** UserRegistry the name gets as subregistry; `undefined` for a locked name. */
  readonly registry: Address | undefined;
  /** UserRegistries that do not exist yet. */
  readonly deploys: readonly { readonly address: Address; readonly call: Plan.Call }[];
  /** `setParent`, `register` and role clean-up on the UserRegistries; they need them deployed. */
  readonly calls: readonly Plan.Call[];
  /** Registrations in a locked name's WrapperRegistry, which exists once the name migrated. */
  readonly wrapped: readonly Plan.Call[];
  readonly leftBehind: readonly LeftBehind[];
  readonly warnings: readonly Plan.Warning[];
};

/** Where a level of subnames is registered. */
type Target =
  | { readonly kind: "user"; readonly address: Address }
  | { readonly kind: "wrapper"; readonly address: Address; readonly fuses: number };

// The sender recreates subnames in registries others own: it holds these only until it is done.
const recreationRoles =
  Roles.registry.registrar |
  Roles.registry.registrarAdmin |
  Roles.registry.setParent |
  Roles.registry.setParentAdmin;

const parentOf = (name: string): string => name.slice(name.indexOf(".") + 1);

/**
 * Plans the recreation of `parent`'s `subnames` (full names, or names relative to it, at any
 * depth), as the ENS app does: each keeps its ENSv1 holder and resolver, with every role and no
 * expiry. An unlocked parent gets a UserRegistry; a locked one registers its children in its
 * WrapperRegistry once it migrated, which only its new owner can do, and not after
 * `cannotCreateSubdomain`. Every recreated subname with subnames of its own gets a UserRegistry
 * owned by its holder. Emancipated children of a locked parent migrate themselves (a warning).
 * Registry addresses follow the ENS app's salt.
 */
export const planRecreation = Effect.fnUntraced(function* (
  client: Client,
  options: {
    readonly parent: { readonly name: string; readonly label: string; readonly node: Hex };
    readonly subnames: readonly string[];
    /** The parent's ENSv2 owner after migrating. */
    readonly owner: Address;
    /** The account that sends the calls and deploys the registries. */
    readonly sender: Address;
    /** Registry the parent lands in. */
    readonly parentRegistry: Address;
    /** A locked parent's predicted WrapperRegistry and NameWrapper fuses. */
    readonly wrapperRegistry?: { readonly address: Address; readonly fuses: number } | undefined;
  },
): Effect.fn.Return<Recreation, AnyError> {
  const { parent, sender } = options;
  const suffix = `.${parent.name}`;
  const tld = parent.name.slice(parent.name.lastIndexOf(".") + 1);

  const listed: string[] = [];
  for (const input of options.subnames) {
    const lowered = input.toLowerCase();
    const name = lowered.endsWith(suffix) ? lowered : `${lowered}${suffix}`;
    // A full name under another parent would otherwise read as a relative one.
    if (!lowered.endsWith(suffix) && (lowered === tld || lowered.endsWith(`.${tld}`))) {
      return yield* Effect.fail(
        new InvalidInputError({
          code: "INVALID_NAME",
          input,
          field: "subnames",
          shortMessage: `${input} is not a subname of ${parent.name}.`,
        }),
      );
    }
    if (!listed.includes(name)) listed.push(name);
  }
  // Every level between the parent and a listed subname is recreated too.
  const names = [...listed];
  for (const name of listed) {
    for (let level = parentOf(name); level !== parent.name; level = parentOf(level)) {
      if (!names.includes(level)) names.push(level);
    }
  }

  const loaded = new Map<string, LoadedName>(
    yield* Effect.forEach(
      names,
      (name) => loadName(client, name).pipe(Effect.map((child) => [name, child] as const)),
      { concurrency: "unbounded" },
    ),
  );
  for (const name of names) {
    const kind = loaded.get(name)?.kind;
    if (!listed.includes(name) && kind !== "v1-unwrapped" && kind !== "v1-wrapped") {
      return yield* Effect.fail(
        new InvalidInputError({
          code: "INVALID_NAME",
          input: name,
          field: "subnames",
          shortMessage: `${name} is not on ENSv1: it cannot hold the subnames listed below it.`,
        }),
      );
    }
  }
  const childrenOf = (name: string) => names.filter((child) => parentOf(child) === name);
  const descendantsOf = (name: string) => names.filter((child) => child.endsWith(`.${name}`));

  const deploys: { readonly address: Address; readonly call: Plan.Call }[] = [];
  const registryCalls = new Map<Address, Plan.Call[]>();
  const wrapped: Plan.Call[] = [];
  const leftBehind: LeftBehind[] = [];
  const warnings: Plan.Warning[] = [];
  const temporary = new Set<Address>();

  const userRegistry = Effect.fnUntraced(function* (
    node: Hex,
    holder: Address,
    into: Address,
    label: string,
  ) {
    // The sender keeps root roles only on registries of names it ends up holding.
    const holds = isAddressEqual(holder, sender);
    const deployment = yield* deployUserRegistry(client, {
      deployer: sender,
      owners: [holder],
      emancipated: false,
      salt: migrationUserRegistrySalt(node),
      grants: holds ? [] : [{ account: sender, roleBitmap: recreationRoles }],
    });
    const { address } = deployment;
    if (!(yield* Rpc.hasCode(client, address))) deploys.push(deployment);
    if (!holds) temporary.add(address);
    registryCalls.set(address, [
      {
        to: address,
        data: encodeFunctionData({
          abi: Abis.v2.userRegistry,
          functionName: "setParent",
          args: [into, label],
        }),
        value: 0n,
      },
    ]);
    return address;
  });

  const top: Target =
    options.wrapperRegistry === undefined
      ? {
          kind: "user",
          address: yield* userRegistry(
            parent.node,
            options.owner,
            options.parentRegistry,
            parent.label,
          ),
        }
      : { kind: "wrapper", ...options.wrapperRegistry };

  // Parents before children: a level is registered in the registry its parent got.
  const levels: { readonly name: string; readonly target: Target }[] = [
    { name: parent.name, target: top },
  ];
  for (let level = levels.shift(); level !== undefined; level = levels.shift()) {
    const { target } = level;
    for (const name of childrenOf(level.name)) {
      const child = loaded.get(name);
      if (child === undefined) continue;
      const { kind, state, data } = child;
      const fuses = kind === "v1-wrapped" ? (data.v1?.wrapper.fuses ?? 0) : 0;
      const leave = (reason: string) => {
        leftBehind.push({ name: state.name, reason });
        for (const descendant of descendantsOf(name)) {
          leftBehind.push({ name: descendant, reason: `${state.name} is left behind` });
        }
      };

      if (kind !== "v1-unwrapped" && kind !== "v1-wrapped") {
        leave("not an ENSv1 name");
        continue;
      }
      if (data.parts.encodedLabel || state.owner === null) {
        leave("unknown label or no owner");
        continue;
      }
      if (target.kind === "wrapper") {
        if (Fuse.has(fuses, "parentCannotControl")) {
          warnings.push({
            code: "SUBNAMES_MIGRATE_SEPARATELY",
            message: `${state.name} is emancipated: its holder migrates it, with its subnames, once ${level.name} has migrated.`,
          });
          continue;
        }
        if (Fuse.has(target.fuses, "cannotCreateSubdomain")) {
          leave(`${level.name} burned cannotCreateSubdomain`);
          continue;
        }
        if (!isAddressEqual(options.owner, sender)) {
          leave(`only ${level.name}'s new owner can register it in its WrapperRegistry`);
          continue;
        }
      } else if (kind === "v1-wrapped" && fuses !== 0) {
        leave("wrapped with fuses");
        continue;
      }

      const holder = getAddress(state.owner);
      const subregistry =
        childrenOf(name).length > 0
          ? yield* userRegistry(data.parts.node, holder, target.address, data.parts.label)
          : zeroAddress;
      const register: Plan.Call = {
        to: target.address,
        data: encodeFunctionData({
          abi: Abis.v2.userRegistry,
          functionName: "register",
          args: [
            data.parts.label,
            holder,
            subregistry,
            state.resolver ?? zeroAddress,
            rootRoles(false),
            maxUint64,
          ],
        }),
        value: 0n,
      };
      if (target.kind === "wrapper") wrapped.push(register);
      else registryCalls.get(target.address)?.push(register);
      if (subregistry !== zeroAddress) {
        levels.push({ name, target: { kind: "user", address: subregistry } });
      }
    }
  }

  for (const address of temporary) {
    registryCalls.get(address)?.push({
      to: address,
      data: encodeFunctionData({
        abi: Abis.v2.userRegistry,
        functionName: "revokeRootRoles",
        args: [recreationRoles, sender],
      }),
      value: 0n,
    });
  }
  return {
    registry: top.kind === "user" ? top.address : undefined,
    deploys,
    calls: [...registryCalls.values()].flat(),
    wrapped,
    leftBehind,
    warnings,
  };
});
