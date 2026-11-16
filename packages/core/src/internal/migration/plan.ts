import { Effect } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { ownedResolverSalt, predictVerifiableProxyAddress } from "@ensforge/contracts/v2";
import {
  encodeAbiParameters,
  encodeFunctionData,
  hexToBigInt,
  isAddressEqual,
  keccak256,
  stringToHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { getCode } from "viem/actions";

import type { NameInput, Status } from "../../actions/migration/types.js";
import type { Client } from "../../client/types.js";
import { InvalidInputError } from "../../errors/classes/InvalidInputError.js";
import { MigrationError } from "../../errors/classes/MigrationError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import { requireAddress } from "../name/write.js";
import { recordsCall } from "../records/write-call.js";
import { deployPermissionedResolver } from "../resolver/deploy.js";
import * as Rpc from "../rpc/index.js";
import { inspectMigration, type Inspection, type ResolverChoice } from "./inspect.js";
import { recordsToCopy, type CopiedRecords } from "./records.js";
import { planRecreation } from "./subnames.js";

/** What `migration.migrate` takes, besides the signer. */
export type MigrationInput = {
  readonly names: NameInput | readonly NameInput[];
  readonly resolver?: string | undefined;
  readonly owner?: string | undefined;
  readonly allowIncompleteRecords?: boolean | undefined;
  readonly allowLeavingSubnames?: boolean | undefined;
  readonly preserveManager?: boolean | undefined;
  readonly migrateParents?: boolean | undefined;
  /** Names in grace are renewed by an earlier step. */
  readonly renewing?: boolean | undefined;
};

/** The ENSv2 state a migrated name should reach, checked by `migrateSync`. */
export type Expectation = {
  readonly name: string;
  readonly owner: Address;
  readonly resolver: Address | null;
  readonly subregistry: Address | null;
  readonly records: CopiedRecords | undefined;
};

/** The migration part of a plan: steps, deployments, warnings, expectations. */
export type MigrationPlan = {
  readonly steps: readonly Plan.Step[];
  readonly deploys: readonly Plan.Deployment[];
  readonly warnings: readonly Plan.Warning[];
  readonly expectations: readonly Expectation[];
  /** Names that need renewing before they can move. */
  readonly expired: readonly string[];
};

/** `LibMigration.Data`. */
const dataTuple = {
  type: "tuple",
  components: [
    { name: "label", type: "string" },
    { name: "owner", type: "address" },
    { name: "subregistry", type: "address" },
    { name: "resolver", type: "address" },
  ],
} as const;
type MigrationData = {
  readonly label: string;
  readonly owner: Address;
  readonly subregistry: Address;
  readonly resolver: Address;
};

// Steps stay well inside a block's gas limit; a migration transfer costs about 200k gas.
const maxCallsPerStep = 30;

const migrationResolverDomain = keccak256(stringToHex("ensforge.migration.resolver"));
/** One resolver per name and deployer, so an interrupted migration finds it again. */
const migrationResolverSalt = (node: Hex): bigint =>
  BigInt(
    keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "bytes32" }],
        [migrationResolverDomain, node],
      ),
    ),
  );

const nameOf = (input: NameInput): string => (typeof input === "string" ? input : input.name);
const parentOf = (name: string): string => name.slice(name.indexOf(".") + 1);

const deployed = (client: Client, address: Address) =>
  Rpc.fromPromise(() => getCode(client.publicClient, { address })).pipe(
    Effect.map((code) => code !== undefined && code !== "0x"),
  );

/** Inspects the names, adding unmigrated locked parents when `migrateParents` asks for them. */
const inspectAll = Effect.fnUntraced(function* (
  client: Client,
  inputs: readonly NameInput[],
  options: {
    readonly signer: Address;
    readonly resolver: ResolverChoice;
    readonly migrateParents: boolean;
  },
): Effect.fn.Return<
  readonly { readonly input: NameInput; readonly inspection: Inspection }[],
  AnyError
> {
  const inspect = (input: NameInput) =>
    inspectMigration(client, nameOf(input), {
      account: options.signer,
      resolver: options.resolver,
    }).pipe(Effect.map((inspection) => ({ input, inspection })));

  const entries = [...(yield* Effect.forEach(inputs, inspect, { concurrency: "unbounded" }))];
  // Parents first: each round adds the parents still on ENSv1 of the locked children so far.
  while (options.migrateParents) {
    const known = new Set(entries.map((entry) => entry.inspection.status.name));
    const missing = [
      ...new Set(
        entries
          .filter((entry) => entry.inspection.status.blockers.includes("parent-not-migrated"))
          .map((entry) => parentOf(entry.inspection.status.name))
          .filter((parent) => !known.has(parent)),
      ),
    ];
    if (missing.length === 0) break;
    entries.unshift(...(yield* Effect.forEach(missing, inspect, { concurrency: "unbounded" })));
  }
  return entries;
});

/** Fails with the first name that cannot migrate, unless an earlier step clears its blocker. */
const requireEligible = (
  entries: readonly { readonly inspection: Inspection }[],
  options: { readonly renewing: boolean },
): Effect.Effect<void, AnyError> => {
  const migrating = new Set(entries.map((entry) => entry.inspection.status.name));
  for (const { inspection } of entries) {
    const { status } = inspection;
    if (status.status === "migrated") {
      return Effect.fail(
        new MigrationError({ code: "ALREADY_MIGRATED", context: { name: status.name } }),
      );
    }
    const blockers = status.blockers.filter(
      (blocker) =>
        !(blocker === "expired" && options.renewing) &&
        !(blocker === "parent-not-migrated" && migrating.has(parentOf(status.name))) &&
        // A name renewed in this plan cannot have its token checked until then.
        !(blocker === "not-owner" && options.renewing && status.blockers.includes("expired")),
    );
    if (status.status === "not-required" || blockers.length > 0) {
      return Effect.fail(
        new MigrationError({
          code: "NOT_ELIGIBLE",
          blockers: status.status === "not-required" ? ["not-required"] : blockers,
          context: { name: status.name },
        }),
      );
    }
  }
  return Effect.void;
};

/**
 * Plans the migration of `input.names` for `signer`: resolver and subregistry setup first, then
 * the token transfers (parents before their locked children), then the optional manager grants.
 * The transfer is the only irreversible part, so it comes after everything it depends on.
 */
export const planMigration = Effect.fnUntraced(function* (
  client: Client,
  input: MigrationInput,
  signer: Address,
): Effect.fn.Return<MigrationPlan, AnyError> {
  const v1 = client.deployment.v1?.contracts;
  const v2 = client.deployment.v2;
  if (v1 === undefined || v2 === undefined) {
    return yield* Effect.fail(new MigrationError({ code: "NOT_ELIGIBLE", blockers: ["not-eth"] }));
  }
  const inputs = Array.isArray(input.names)
    ? (input.names as readonly NameInput[])
    : [input.names as NameInput];
  const resolverChoice: ResolverChoice =
    input.resolver === undefined || ["new", "owned", "keep"].includes(input.resolver)
      ? (input.resolver as ResolverChoice)
      : yield* requireAddress(input.resolver, "resolver");
  const newOwner =
    input.owner === undefined ? undefined : yield* requireAddress(input.owner, "owner");

  const entries = yield* inspectAll(client, inputs, {
    signer,
    resolver: resolverChoice,
    migrateParents: input.migrateParents === true,
  });
  yield* requireEligible(entries, { renewing: input.renewing === true });

  const proxyLogic = yield* Rpc.readContract(client, {
    address: v2.contracts.verifiableFactory,
    abi: Abis.v2.verifiableFactory,
    functionName: "proxyLogic",
  });

  const setup: Plan.Call[] = [];
  const registries: Plan.Call[] = [];
  const records: Plan.Call[] = [];
  const afterRecords: Plan.Call[] = [];
  const managers: Plan.Call[] = [];
  const deploys: Plan.Deployment[] = [];
  const warnings: Plan.Warning[] = [];
  const expectations: Expectation[] = [];
  const moves: {
    readonly depth: number;
    readonly holder: Address;
    readonly status: Status;
    readonly data: MigrationData;
    readonly node: Hex;
    readonly target: Address;
  }[] = [];
  /** WrapperRegistry each locked name migrating here gets, for its children. */
  const wrapperRegistries = new Map<
    string,
    { readonly address: Address; readonly depth: number }
  >();

  let owned: Address | undefined;
  for (const { input: nameInput, inspection } of entries) {
    const { status, loaded } = inspection;
    const config = typeof nameInput === "string" ? undefined : nameInput;
    const { parts } = loaded.data;
    const route = status.route;
    // In grace the registrar does not report the holder; the renewal in this plan is sent by the
    // signer, and the transfer is simulated again after it, so the signer stands in.
    const renewed = input.renewing === true && status.blockers.includes("expired");
    const holder = status.owner ?? (renewed ? signer : null);
    if (route === null || holder === null) {
      return yield* Effect.fail(
        new MigrationError({
          code: "NOT_ELIGIBLE",
          blockers: route === null ? ["not-required"] : ["not-owner"],
          context: { name: status.name },
        }),
      );
    }
    const owner = newOwner ?? holder;
    const locked = route === "wrapped-locked" || route === "locked-child";

    // Resolver: create or reuse one, keep the current one, or let the controller decide.
    let resolver: Address = status.resolver.current ?? zeroAddress;
    let copied: CopiedRecords | undefined;
    const plan = status.resolver.plan;
    if (plan === "new" || plan === "owned" || plan === "public-v2") {
      const copy = yield* recordsToCopy(client, config, status.name, {
        hasRecords: inspection.publicResolver,
        allowIncomplete: input.allowIncompleteRecords === true,
      });
      copied = copy.records;
      if (copy.warning !== undefined) warnings.push(copy.warning);
    }
    if (plan === "new") {
      const grants =
        input.preserveManager === true && status.manager !== null
          ? [{ account: status.manager, roleBitmap: managerRecordRoles }]
          : [];
      const deployment = yield* deployPermissionedResolver(client, {
        deployer: signer,
        owner,
        salt: migrationResolverSalt(parts.node),
        grants,
        name: parts,
        records: copied,
      });
      resolver = deployment.address;
      if (!(yield* deployed(client, resolver))) {
        setup.push(deployment.call);
        deploys.push({ contract: "resolver", address: resolver });
      }
    } else if (plan === "owned") {
      if (!isAddressEqual(owner, signer)) {
        return yield* Effect.fail(
          new InvalidInputError({
            code: "INVALID_RECORD_VALUE",
            field: "resolver",
            input: "owned",
            shortMessage: "The shared resolver is only for names the signer keeps.",
          }),
        );
      }
      const deployment = yield* deployPermissionedResolver(client, {
        deployer: signer,
        owner: signer,
        salt: ownedResolverSalt(signer),
      });
      resolver = deployment.address;
      if (owned === undefined) {
        owned = resolver;
        if (!(yield* deployed(client, resolver))) {
          setup.push(deployment.call);
          deploys.push({ contract: "resolver", address: resolver });
        }
      }
      if (copied !== undefined)
        records.push(yield* recordsCall(client, resolver, parts, copied, "name"));
    } else if (plan === "address") {
      resolver = resolverChoice as Address;
    } else if (plan === "public-v2") {
      // The controller swaps the ENSv1 public resolver for PublicResolverV2, which starts empty.
      resolver = v2.contracts.publicResolver;
      if (copied !== undefined) {
        if (!isAddressEqual(owner, signer)) {
          warnings.push({
            code: "RECORDS_NOT_COPIED",
            message: `${status.name} gets PublicResolverV2; its new owner writes the records there after migrating.`,
          });
        } else {
          afterRecords.push(yield* recordsCall(client, resolver, parts, copied, "node"));
        }
      }
    } else if (plan === "keep" && inspection.publicResolver) {
      warnings.push({
        code: "RECORDS_READ_ONLY",
        message: `${status.name} keeps its ENSv1 public resolver; its records stay readable but can no longer change.`,
      });
    } else if (plan === "none") {
      resolver = zeroAddress;
    }

    // Subnames: unlocked names recreate the listed children in a new UserRegistry.
    let subregistry: Address = zeroAddress;
    if (config?.subnames !== undefined && config.subnames.length > 0) {
      if (locked) {
        return yield* Effect.fail(
          new InvalidInputError({
            code: "INVALID_NAME",
            field: "subnames",
            input: status.name,
            shortMessage: `${status.name} is locked: its subnames move into its WrapperRegistry on their own.`,
          }),
        );
      }
      const recreation = yield* planRecreation(client, {
        parent: { name: status.name, label: parts.label, node: parts.node },
        subnames: config.subnames,
        owner,
        signer,
        parentRegistry: v2.contracts.ethRegistry,
      });
      if (recreation.leftBehind.length > 0 && input.allowLeavingSubnames !== true) {
        return yield* Effect.fail(
          new MigrationError({
            code: "NOT_ELIGIBLE",
            blockers: recreation.leftBehind.map(
              (child) => `subname ${child.name}: ${child.reason}`,
            ),
            context: { name: status.name },
            hint: "Pass `allowLeavingSubnames` to migrate without them.",
          }),
        );
      }
      subregistry = recreation.registry;
      if (recreation.deploy !== undefined) {
        setup.push(recreation.deploy);
        deploys.push({ contract: "registry", address: subregistry });
      }
      registries.push(...recreation.calls);
    } else if (!locked) {
      warnings.push({
        code: "SUBNAMES_NOT_RECREATED",
        message: `Subnames of ${status.name} are not carried over unless listed in \`subnames\`.`,
      });
    }

    // Where the token goes, and the WrapperRegistry a locked name gets for its children.
    const parentRegistry = wrapperRegistries.get(parentOf(status.name));
    const target =
      route === "unwrapped" || route === "wrapped-unlocked"
        ? v2.migration.unlockedMigrationController
        : route === "wrapped-locked"
          ? v2.migration.lockedMigrationController
          : (parentRegistry?.address ?? (loaded.data.v2?.registry as Address));
    const depth = route === "locked-child" ? (parentRegistry?.depth ?? -1) + 1 : 0;
    if (locked) {
      wrapperRegistries.set(status.name, {
        address: predictVerifiableProxyAddress({
          factory: v2.contracts.verifiableFactory,
          proxyLogic,
          deployer: target,
          salt: hexToBigInt(parts.node),
        }),
        depth,
      });
    }
    moves.push({
      depth,
      holder,
      status,
      node: parts.node,
      target,
      data: { label: parts.label, owner, subregistry, resolver },
    });

    if (input.preserveManager === true && status.manager !== null) {
      if (isAddressEqual(owner, signer)) {
        managers.push({
          to: v2.contracts.ethRegistry,
          data: encodeFunctionData({
            abi: Abis.v2.permissionedRegistry,
            functionName: "grantRoles",
            args: [hexToBigInt(parts.labelhash), Roles.registry.setResolver, status.manager],
          }),
          value: 0n,
        });
      } else {
        warnings.push({
          code: "MANAGER_NOT_PRESERVED",
          message: `${status.name} goes to another owner, who grants its ENSv1 manager \`setResolver\` if wanted.`,
        });
      }
    }

    expectations.push({
      name: status.name,
      owner,
      resolver: plan === "keep" && locked ? null : resolver === zeroAddress ? null : resolver,
      subregistry: locked ? null : subregistry === zeroAddress ? null : subregistry,
      records: copied,
    });
  }

  const steps: Plan.Step[] = [];
  const chunked = (id: string, description: string, calls: readonly Plan.Call[]) => {
    for (let index = 0; index < calls.length; index += maxCallsPerStep) {
      const part = index / maxCallsPerStep;
      steps.push({
        id: part === 0 ? id : `${id}-${part + 1}`,
        description,
        calls: calls.slice(index, index + maxCallsPerStep),
      });
    }
  };
  chunked("setup", "Create resolvers and registries", setup);
  chunked("subnames", "Recreate subnames", registries);
  chunked("records", "Copy records", records);
  // Parents migrate before their locked children, whose WrapperRegistry they create.
  const deepest = Math.max(0, ...moves.map((move) => move.depth));
  for (let depth = 0; depth <= deepest; depth += 1) {
    const group = moves.filter((move) => move.depth === depth);
    if (group.length === 0) continue;
    chunked(
      depth === 0 ? "migrate" : `migrate-children-${depth}`,
      depth === 0 ? "Migrate names" : "Migrate locked subnames",
      transferCalls(v1, group),
    );
  }
  chunked("records-after", "Copy records to PublicResolverV2", afterRecords);
  chunked("manager", "Restore ENSv1 managers", managers);

  return {
    steps,
    deploys,
    warnings,
    expectations,
    expired: entries
      .filter((entry) => entry.inspection.status.blockers.includes("expired"))
      .map((entry) => entry.inspection.status.name),
  };
});

/** The record setter roles an ENSv1 manager gets on the name's new resolver (no admin roles). */
const managerRecordRoles =
  Roles.resolver.setAddr |
  Roles.resolver.setText |
  Roles.resolver.setContenthash |
  Roles.resolver.setAbi |
  Roles.resolver.setInterface |
  Roles.resolver.setName |
  Roles.resolver.setData;

/**
 * The token transfers that migrate `moves`: one ERC-721 transfer per unwrapped name, and one
 * ERC-1155 transfer (batched per holder and receiver) for wrapped names.
 */
const transferCalls = (
  v1: { readonly baseRegistrar: Address; readonly nameWrapper: Address },
  moves: readonly {
    readonly holder: Address;
    readonly status: Status;
    readonly node: Hex;
    readonly target: Address;
    readonly data: MigrationData;
  }[],
): Plan.Call[] => {
  const calls: Plan.Call[] = [];
  const wrapped = new Map<string, typeof moves>();
  for (const move of moves) {
    const { holder } = move;
    if (move.status.route === "unwrapped") {
      calls.push({
        to: v1.baseRegistrar,
        data: encodeFunctionData({
          abi: Abis.v1.baseRegistrar,
          functionName: "safeTransferFrom",
          args: [
            holder,
            move.target,
            hexToBigInt(keccak256(stringToHex(move.data.label))),
            encodeAbiParameters([dataTuple], [move.data]),
          ],
        }),
        value: 0n,
      });
      continue;
    }
    const key = `${holder.toLowerCase()}:${move.target.toLowerCase()}`;
    wrapped.set(key, [...(wrapped.get(key) ?? []), move]);
  }

  for (const group of wrapped.values()) {
    const [first] = group;
    if (first === undefined) continue;
    const { holder } = first;
    calls.push({
      to: v1.nameWrapper,
      data:
        group.length === 1
          ? encodeFunctionData({
              abi: Abis.v1.nameWrapper,
              functionName: "safeTransferFrom",
              args: [
                holder,
                first.target,
                hexToBigInt(first.node),
                1n,
                encodeAbiParameters([dataTuple], [first.data]),
              ],
            })
          : encodeFunctionData({
              abi: Abis.v1.nameWrapper,
              functionName: "safeBatchTransferFrom",
              args: [
                holder,
                first.target,
                group.map((move) => hexToBigInt(move.node)),
                group.map(() => 1n),
                encodeAbiParameters(
                  [{ type: "tuple[]", components: dataTuple.components }],
                  [group.map((move) => move.data)],
                ),
              ],
            }),
      value: 0n,
    });
  }
  return calls;
};
