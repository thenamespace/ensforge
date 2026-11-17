import { Effect } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { hexToBigInt, isAddressEqual, maxUint64, type Address } from "viem";

import type { Blocker, ResolverPlan, Route, Status } from "../../actions/migration/types.js";
import type { Client } from "../../client/types.js";
import { UnsupportedError } from "../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import * as Fuse from "../../utils/Fuse.js";
import * as Role from "../../utils/Role.js";
import { nonZeroAddress, sameAddress } from "../address.js";
import { loadName, type LoadedName } from "../name/load.js";
import { RegistryStatus } from "../name/read.js";
import { blockAt } from "../rpc/block.js";
import * as Rpc from "../rpc/index.js";

/** How the caller wants each name's resolver handled; `undefined` picks per name. */
export type ResolverChoice = "new" | "owned" | "keep" | Address | undefined;

/** Everything the planner needs about one name, besides its public status. */
export type Inspection = {
  readonly status: Status;
  readonly loaded: LoadedName;
  /** Fuse mask of a wrapped name (0 when unwrapped). */
  readonly fuses: number;
  /** Whether the current resolver is an ENS public resolver (its records can be copied). */
  readonly publicResolver: boolean;
};

const lockedFuseRoles = (fuses: number): bigint => {
  // LockedWrapperReceiver._tokenRoleBitmapFromFuses.
  let roles = Fuse.has(fuses, "cannotSetResolver") ? 0n : Roles.registry.setResolver;
  if (!Fuse.has(fuses, "cannotBurnFuses")) roles |= roles << 128n;
  if (!Fuse.has(fuses, "cannotTransfer")) roles |= Roles.registry.canTransferAdmin;
  return roles;
};

/** The route of an ENSv1 `.eth` name or subname, or `null` with the blocker that explains it. */
const routeOf = (
  loaded: LoadedName,
  fuses: number,
): { readonly route: Route | null; readonly blocker?: Blocker } => {
  const { kind, data } = loaded;
  if (data.parts.isEth2ld) {
    if (kind === "v1-unwrapped") return { route: "unwrapped" };
    return Fuse.has(fuses, "cannotUnwrap")
      ? { route: "wrapped-locked" }
      : { route: "wrapped-unlocked" };
  }
  const emancipated = Fuse.has(fuses, "parentCannotControl") && !Fuse.has(fuses, "isDotEth");
  if (kind === "v1-wrapped" && (Fuse.has(fuses, "cannotUnwrap") || emancipated)) {
    return { route: "locked-child" };
  }
  return { route: null, blocker: "unlocked-child" };
};

/**
 * Reads what migrating `name` involves: route, blockers (for `account`, when given), the token
 * holder, the resolver plan for `resolver`, and the ENSv2 state after migrating.
 */
export const inspectMigration = Effect.fnUntraced(function* (
  client: Client,
  name: string,
  options: {
    readonly account?: Address | undefined;
    readonly resolver?: ResolverChoice;
  } & Read.BlockOptions,
): Effect.fn.Return<Inspection, AnyError> {
  const at = blockAt(options);
  const loaded = yield* loadName(client, name, at);
  const { kind, state, data } = loaded;
  const v1 = data.v1;
  const v1Contracts = client.deployment.v1?.contracts;
  const v2 = client.deployment.v2;
  const fuses = kind === "v1-wrapped" ? (v1?.wrapper.fuses ?? 0) : 0;
  const isEth = state.name === "eth" || state.name.endsWith(".eth");

  const unmigratable = (status: Status["status"], blockers: readonly Blocker[] = []) => ({
    status: {
      name: state.name,
      status,
      route: null,
      blockers,
      owner: null,
      manager: null,
      fuses: null,
      expiry: null,
      reservationExpiry: null,
      resolver: { current: null, plan: "none" },
      after: { registry: null, subregistry: null, expiry: null, roles: [] },
    } satisfies Status,
    loaded,
    fuses,
    publicResolver: false,
  });
  if (kind === "v2-migrated") return unmigratable("migrated");
  if (kind !== "v1-unwrapped" && kind !== "v1-wrapped") return unmigratable("not-required");
  if (v1Contracts === undefined || v2 === undefined) {
    return yield* Effect.fail(
      new UnsupportedError({ code: "UNSUPPORTED_ON_DEPLOYMENT", feature: "ENSv2 migration" }),
    );
  }
  if (!isEth) return unmigratable("blocked", ["not-eth"]);

  const { route, blocker } = routeOf(loaded, fuses);
  const blockers: Blocker[] = blocker === undefined ? [] : [blocker];
  if (data.parts.encodedLabel) blockers.push("unknown-label");
  if (state.status === "grace" || state.status === "expired") blockers.push("expired");

  const unwrapped = route === "unwrapped";
  const owner = unwrapped ? state.registrant : nonZeroAddress(v1?.wrapper.owner);
  const token = unwrapped
    ? { address: v1Contracts.baseRegistrar, id: hexToBigInt(data.parts.labelhash) }
    : { address: v1Contracts.nameWrapper, id: hexToBigInt(data.parts.node) };
  const resolver = state.resolver;
  const account = options.account;

  const reads = yield* Effect.all(
    {
      approved: Rpc.readContractOrUndefined(client, {
        address: token.address,
        abi: Abis.shared.erc721,
        functionName: "getApproved",
        args: [token.id],
        ...at,
      }),
      operator:
        account === undefined || owner === null
          ? Effect.undefined
          : Rpc.readContractOrUndefined(client, {
              address: token.address,
              abi: Abis.shared.erc721,
              functionName: "isApprovedForAll",
              args: [owner, account],
              ...at,
            }),
      listed:
        resolver === null
          ? Effect.succeed(false)
          : Rpc.readContractOrUndefined(client, {
              address: v2.migration.publicResolverSet,
              abi: Abis.v2.permissionedAddressSet,
              functionName: "includes",
              args: [resolver],
              ...at,
            }).pipe(Effect.map((included) => included === true)),
    },
    { concurrency: "unbounded" },
  );

  const approved = nonZeroAddress(reads.approved);
  if (
    account !== undefined &&
    owner !== null &&
    !isAddressEqual(owner, account) &&
    reads.operator !== true &&
    !sameAddress(approved, account)
  ) {
    blockers.push("not-owner");
  }
  if (Fuse.has(fuses, "cannotTransfer")) blockers.push("cannot-transfer");
  if (Fuse.has(fuses, "cannotApprove") && approved !== null) blockers.push("frozen-approval");

  // `.eth` names claim their ENSv2 reservation. A locked child needs only its parent's
  // WrapperRegistry: it reserves nothing, but takes the child while the NameWrapper holds it.
  const reservation =
    data.v2 !== undefined && data.v2.state.status === RegistryStatus.reserved ? data.v2 : undefined;
  if (route === "locked-child") {
    if (data.v2 === undefined) blockers.push("parent-not-migrated");
  } else if (route !== null && reservation === undefined) blockers.push("not-reserved");

  const publicResolver =
    resolver !== null &&
    (reads.listed ||
      [
        v1Contracts.publicResolver,
        ...(client.deployment.v1?.legacyPublicResolvers ?? []),
        ...(client.deployment.v1?.frozenPublicResolvers ?? []),
      ].some((address) => isAddressEqual(address, resolver)));
  const locked = route === "wrapped-locked" || route === "locked-child";
  const plan = resolverPlan(options.resolver, {
    resolver,
    publicResolver,
    listed: reads.listed,
    lockedResolver: locked && Fuse.has(fuses, "cannotSetResolver"),
  });
  if (
    plan === "keep" &&
    locked &&
    Fuse.has(fuses, "cannotSetResolver") &&
    !reads.listed &&
    resolver !== null &&
    options.resolver !== "keep"
  ) {
    blockers.push("locked-resolver");
  }

  const renewRole = v2.capabilities.lockedMigrationRenewal === "renew-role";
  const extendable = Fuse.has(fuses, "canExtendExpiry");
  const roles = !locked
    ? Roles.registryBitmaps.registration
    : lockedFuseRoles(fuses) |
      (route === "locked-child" && extendable && renewRole
        ? Roles.registry.renew | Roles.registry.renewAdmin
        : 0n);
  const expiry =
    route === "locked-child"
      ? extendable && !renewRole
        ? maxUint64
        : (v1?.wrapper.expiry ?? null)
      : (reservation?.state.expiry ?? null);

  return {
    loaded,
    fuses,
    publicResolver,
    status: {
      name: state.name,
      status: blockers.length === 0 ? "eligible" : "blocked",
      route,
      blockers,
      owner,
      manager:
        unwrapped &&
        v1 !== undefined &&
        state.registrant !== null &&
        !isAddressEqual(v1.registryOwner, state.registrant) &&
        nonZeroAddress(v1.registryOwner) !== null
          ? v1.registryOwner
          : null,
      fuses: kind === "v1-wrapped" ? Fuse.decode(fuses) : null,
      expiry: state.expiry,
      reservationExpiry: reservation?.state.expiry ?? null,
      resolver: { current: resolver, plan },
      after: {
        registry: data.v2?.registry ?? null,
        subregistry: locked ? "wrapper-registry" : null,
        expiry,
        roles: route === null ? [] : Role.toNames(roles, "registry"),
      },
    },
  };
});

/** What happens to the resolver, given the caller's choice and the name's current resolver. */
const resolverPlan = (
  choice: ResolverChoice,
  context: {
    readonly resolver: Address | null;
    readonly publicResolver: boolean;
    readonly listed: boolean;
    readonly lockedResolver: boolean;
  },
): ResolverPlan => {
  // `cannotSetResolver`: the controller keeps the ENSv1 resolver, or swaps a public one.
  if (context.lockedResolver) {
    if (context.resolver === null) return "none";
    return context.listed ? "public-v2" : "keep";
  }
  if (choice === "new" || choice === "owned" || choice === "keep") return choice;
  if (choice !== undefined) return "address";
  if (context.resolver === null) return "none";
  // Custom resolvers (gateways, wildcards, their own permissions) stay; public ones would freeze.
  return context.publicResolver ? "new" : "keep";
};
