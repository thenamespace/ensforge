import { Effect, Array as Arr, Option } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import {
  encodeFunctionData,
  hexToBigInt,
  isAddressEqual,
  maxUint64,
  zeroAddress,
  type Address,
} from "viem";

import type { Client } from "../../../client/types.js";
import { ConfigError } from "../../../errors/classes/ConfigError.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { NameStateError } from "../../../errors/classes/NameStateError.js";
import { NotFoundError } from "../../../errors/classes/NotFoundError.js";
import { UnauthorizedError } from "../../../errors/classes/UnauthorizedError.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { addressOf } from "../../../internal/address.js";
import { tryAny } from "../../../internal/anyError.js";
import { randomSalt } from "../../../internal/factory/verifiable-proxy.js";
import { parentOf } from "../../../internal/name/parts.js";
import * as V1Calls from "../../../internal/name/v1-calls.js";
import { requireAddress, requireV1Contracts } from "../../../internal/name/write.js";
import { explainFor } from "../../../internal/permission/check.js";
import { evaluateChildRewrite } from "../../../internal/permission/evaluate.js";
import { readPermissionFacts } from "../../../internal/permission/facts.js";
import { recordsCall } from "../../../internal/records/write-call.js";
import { attachCalls, deployUserRegistry, parentLabel } from "../../../internal/registry/deploy.js";
import { deployPermissionedResolver } from "../../../internal/resolver/deploy.js";
import { roleBitmapOf } from "../../../internal/role/bitmap.js";
import { loadSubname, type LoadedSubname } from "../../../internal/subname/load.js";
import { updateRoute } from "../../../internal/subname/v1-route.js";
import { requireLockedParent } from "../../../internal/wrapper/fuses.js";
import { make as makePlan } from "../../../plan/make.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Fuse from "../../../utils/Fuse.js";
import type { create as Promises } from "./index.js";

/** The resolver the child gets, and the deployment when ensforge creates it. */
const childResolver = Effect.fnUntraced(function* (
  client: Client,
  subname: LoadedSubname,
  options: Promises.Options,
  owner: Address,
  signer: Address,
): Effect.fn.Return<
  { address: Address; deploy?: Plan.Call | undefined; records: boolean },
  AnyError
> {
  const { resolver, records } = options;
  if (resolver === null) {
    if (records !== undefined) {
      return yield* Effect.fail(
        new InvalidInputError({
          code: "INVALID_RECORD_VALUE",
          field: "records",
          input: null,
          shortMessage: "Records need a resolver.",
        }),
      );
    }
    return { address: zeroAddress, records: false };
  }
  if (resolver === "parent") {
    const address = subname.parent.state.resolver;
    if (address === null) {
      return yield* Effect.fail(new NotFoundError({ code: "RESOLVER_NOT_FOUND" }));
    }
    return { address, records: records !== undefined };
  }
  if (resolver !== undefined) {
    return { address: yield* requireAddress(resolver, "resolver"), records: records !== undefined };
  }
  // Upserts keep the child's resolver rather than deploying a new one.
  if (options.upsert === true && subname.child.state.resolver !== null) {
    return { address: subname.child.state.resolver, records: records !== undefined };
  }

  // Without ENSv2 there is no PermissionedResolver: ENSv1 children get the public resolver.
  if (client.deployment.v2 === undefined && subname.route !== "v2") {
    const { publicResolver } = yield* requireV1Contracts(client);
    return { address: publicResolver, records: records !== undefined };
  }
  const deployment = yield* deployPermissionedResolver(client, {
    deployer: signer,
    writers: [owner],
    salt: randomSalt(),
    name: subname.child.data.parts,
    records,
  });
  return { address: deployment.address, deploy: deployment.call, records: false };
});

/** ENSv2: steps that register (or update) the child in the parent's subregistry. */
const v2Steps = Effect.fnUntraced(function* (
  client: Client,
  subname: LoadedSubname,
  options: Promises.Options,
  context: { readonly owner: Address; readonly signer: Address; readonly resolver: Address },
): Effect.fn.Return<
  { steps: Plan.Step[]; registry: Address | undefined; deployRegistry: Plan.Call | undefined },
  AnyError
> {
  const { parent, child, label } = subname;
  const labelId = hexToBigInt(child.data.parts.labelhash);
  let registry = parent.state.subregistry;
  let deployRegistry: Plan.Call | undefined;
  const steps: Plan.Step[] = [];

  // A parent without children has no subregistry yet: deploy one and attach it first.
  let attach: readonly Plan.Call[] = [];
  if (registry === null) {
    const deployment = yield* deployUserRegistry(client, {
      deployer: context.signer,
      owners: [parent.state.owner ?? context.signer, context.signer],
      emancipated: options.emancipate === true,
      salt: randomSalt(),
    });
    registry = deployment.address;
    deployRegistry = deployment.call;
    const parentName = yield* parentLabel(client, parent.data.parts);
    attach = attachCalls({
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a v2 or wrapped name's state always carries this field; `Name.State` types it as nullable for every protocol
      parentRegistry: parent.state.registry as Address,
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a v2 or wrapped name's state always carries this field; `Name.State` types it as nullable for every protocol
      tokenId: parent.state.tokenId as bigint,
      label: parentName.label,
      registry,
      detach: false,
    });
  }

  const exists = child.state.status === "registered";
  // An existing child keeps its owner, roles and emancipation: they change with name.transfer
  // and role.grant, not here.
  if (
    exists &&
    (options.owner !== undefined || options.roles !== undefined || options.emancipate !== undefined)
  ) {
    return yield* Effect.fail(
      new UnsupportedError({
        code: "UNSUPPORTED_PROTOCOL",
        protocol: "v2",
        feature: "changing an existing ENSv2 subname's owner, roles or emancipation",
        hint: "Use name.transfer for the owner and role.grant for roles.",
      }),
    );
  }
  const roleBitmap =
    options.roles === undefined
      ? Roles.registryBitmaps.registration
      : yield* roleBitmapOf(options.roles, "registry");
  const updates: Plan.Call[] = exists
    ? [
        ...(child.state.resolver !== null && isAddressEqual(child.state.resolver, context.resolver)
          ? []
          : [
              {
                to: registry,
                data: encodeFunctionData({
                  abi: Abis.v2.permissionedRegistry,
                  functionName: "setResolver",
                  args: [labelId, context.resolver],
                }),
                value: 0n,
              },
            ]),
        ...(options.expiry === undefined
          ? []
          : [
              {
                to: registry,
                data: encodeFunctionData({
                  abi: Abis.v2.permissionedRegistry,
                  functionName: "renew",
                  args: [labelId, options.expiry],
                }),
                value: 0n,
              },
            ]),
      ]
    : [];
  const write: readonly Plan.Call[] = exists
    ? updates
    : [
        {
          to: registry,
          data: encodeFunctionData({
            abi: Abis.v2.userRegistry,
            functionName: "register",
            args: [
              label,
              context.owner,
              zeroAddress,
              context.resolver,
              roleBitmap,
              options.expiry ?? maxUint64,
            ],
          }),
          value: 0n,
        },
      ];
  if (attach.length > 0 || write.length > 0) {
    steps.push({
      id: "create",
      description: exists ? "Update subname" : "Create subname",
      calls: [...attach, ...write],
    });
  }
  return { steps, registry: deployRegistry === undefined ? undefined : registry, deployRegistry };
});

/** ENSv1: one `setSubnodeRecord`, on the ENS registry or, for wrapped parents, the NameWrapper. */
const v1Call = Effect.fnUntraced(function* (
  client: Client,
  subname: LoadedSubname,
  options: Promises.Options,
  context: { readonly owner: Address; readonly resolver: Address; readonly signer: Address },
): Effect.fn.Return<{ readonly call: Plan.Call; readonly expiry: bigint }, AnyError> {
  const contracts = yield* requireV1Contracts(client);
  const { parent, child, label } = subname;

  const record = {
    parentNode: parent.data.parts.node,
    label,
    labelhash: child.data.parts.labelhash,
    owner: context.owner,
    resolver: context.resolver,
  };
  if (subname.route === "v1") {
    return { call: V1Calls.setSubnodeRecord(contracts.registry, false, record), expiry: 0n };
  }

  const fuses = yield* tryAny(() => Fuse.from(options.fuses ?? []));
  // An emancipated child is out of its parent's reach until it expires, also once its holder
  // unwrapped it (it then looks available), and a parent without cannotCreateSubdomain may not
  // recreate an expired one.
  const parentFacts = yield* readPermissionFacts(client, parent, context.signer, []);
  const reach = evaluateChildRewrite(parentFacts, child, contracts);
  const fuseBlock = Option.getOrUndefined(
    Arr.findFirst(
      reach.missing,
      (requirement) => requirement.type === "blocked" && requirement.reason === "fuse",
    ),
  );
  if (fuseBlock?.type === "blocked") {
    const expiry = child.data.v1?.wrapper.expiry ?? 0n;
    return yield* Effect.fail(
      new UnauthorizedError({
        code: "FUSE_BURNED",
        shortMessage: `${child.data.parts.name} is out of its parent's reach: ${fuseBlock.detail}`,
        ...(expiry > child.data.now
          ? { hint: `Its parent can create it again after its old expiry (unix time ${expiry}).` }
          : {}),
      }),
    );
  }
  yield* requireLockedParent(options.fuses, fuses, parent.data.v1?.wrapper.fuses ?? 0);
  // As in ensjs: an emancipated child needs an expiry (capped at the parent's by the wrapper).
  const expiry = options.expiry ?? (Fuse.has(fuses, "parentCannotControl") ? maxUint64 : 0n);
  return {
    call: V1Calls.setSubnodeRecord(contracts.nameWrapper, true, { ...record, fuses, expiry }),
    expiry,
  };
});

/**
 * Gives a child created for the signer to its `owner`, from the parent: by labelhash in the
 * registry, or through the NameWrapper with the same expiry, burning the requested fuses only
 * afterwards (`cannotTransfer` would block the hand-over).
 */
const handOverCalls = Effect.fnUntraced(function* (
  client: Client,
  subname: LoadedSubname,
  options: Promises.Options,
  owner: Address,
  expiry: bigint,
): Effect.fn.Return<readonly Plan.Call[], AnyError> {
  const contracts = yield* requireV1Contracts(client);
  const { parent, child, label } = subname;
  const parentNode = parent.data.parts.node;
  const { labelhash } = child.data.parts;
  if (subname.route === "v1") {
    return [
      V1Calls.setSubnodeOwner(contracts.registry, false, { parentNode, label, labelhash, owner }),
    ];
  }
  const fuses = yield* tryAny(() => Fuse.from(options.fuses ?? []));
  return [
    V1Calls.setSubnodeOwner(contracts.nameWrapper, true, {
      parentNode,
      label,
      labelhash,
      owner,
      expiry,
    }),
    ...(fuses === 0
      ? []
      : [V1Calls.setChildFuses(contracts.nameWrapper, parentNode, labelhash, fuses, expiry)]),
  ];
});

/** @internal Builds the plan of `Actions.subname.create`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const signer = addressOf(options.account) ?? client.account;
  if (signer === undefined) {
    return yield* Effect.fail(new ConfigError({ code: "WALLET_NOT_CONFIGURED" }));
  }

  const subname = yield* loadSubname(client, options.name);
  const { child, route } = subname;
  if (child.data.parts.encodedLabel) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_NAME",
        input: options.name,
        shortMessage: "Subnames need a known label.",
      }),
    );
  }
  if (subname.route === "l2") {
    const { createCalls } = yield* Effect.promise(
      () => import("../../../internal/namespace/l2/index.js"),
    );
    const calls = yield* createCalls(subname, options, signer);
    return makePlan({
      operation: "subname.create",
      chainId: subname.target.client.chain.id,
      account: signer,
      steps: [
        {
          id: "create",
          description:
            subname.childState.status === "registered" ? "Update subname" : "Create subname",
          calls,
        },
      ],
    });
  }
  if (child.state.status === "registered" && options.upsert !== true) {
    return yield* Effect.fail(
      new NameStateError({
        code: "NAME_NOT_AVAILABLE",
        shortMessage: `${child.data.parts.name} already exists.`,
        hint: "Pass `upsert: true` to update it.",
      }),
    );
  }
  if (options.roles !== undefined && route !== "v2") {
    return yield* Effect.fail(
      new UnsupportedError({ code: "UNSUPPORTED_PROTOCOL", protocol: "v1", feature: "roles" }),
    );
  }
  if (options.fuses !== undefined && route !== "v1-wrapped") {
    return yield* Effect.fail(
      new UnsupportedError({
        code: "UNSUPPORTED_PROTOCOL",
        protocol: subname.parent.state.protocol,
        feature: "fuses (wrapped ENSv1 parents only)",
      }),
    );
  }

  const owner =
    options.owner === undefined ? signer : yield* requireAddress(options.owner, "owner");
  const resolver = yield* childResolver(client, subname, options, owner, signer);
  const deploys: Plan.Deployment[] = [];
  const steps: Plan.Step[] = [];
  const warnings: Plan.Warning[] = [];
  const after: Plan.Call[] = [];

  if (route === "v2") {
    const v2 = yield* v2Steps(client, subname, options, {
      owner,
      signer,
      resolver: resolver.address,
    });
    // Deployments come first, in one step: the attach and register calls need the code.
    const deployCalls = Arr.filter(
      [v2.deployRegistry, resolver.deploy],
      (call) => call !== undefined,
    );
    if (deployCalls.length > 0) {
      steps.push({ id: "deploy", description: "Deploy contracts", calls: deployCalls });
    }
    steps.push(...v2.steps);
    if (v2.registry !== undefined) deploys.push({ contract: "registry", address: v2.registry });
  } else if (child.state.status === "registered") {
    // An upsert changes only what it is given, through the update routes: the child keeps its
    // owner unless `owner` says otherwise.
    if (options.fuses !== undefined) {
      return yield* Effect.fail(
        new UnsupportedError({
          code: "UNSUPPORTED_PROTOCOL",
          protocol: "v1",
          feature: "fuses on an existing subname",
          hint: "Burn them with wrapper.setFuses as its owner.",
        }),
      );
    }
    const update =
      options.owner === undefined &&
      options.resolver === undefined &&
      resolver.deploy === undefined &&
      options.expiry === undefined
        ? undefined
        : yield* updateRoute(client, subname, signer, {
            owner: options.owner === undefined ? undefined : owner,
            resolver:
              options.resolver === undefined && resolver.deploy === undefined
                ? undefined
                : resolver.address,
            expiry: options.expiry,
          });
    if (update !== undefined || resolver.deploy !== undefined) {
      steps.push({
        id: "create",
        description: "Update subname",
        calls: [
          ...(resolver.deploy === undefined ? [] : [resolver.deploy]),
          ...(update?.calls ?? []),
        ],
      });
    }
    warnings.push(...(update?.warnings ?? []));
  } else {
    // Records on an existing resolver need the owner's authority there, so a child for another
    // owner is created for the signer, given its records, then handed over.
    const handOver =
      resolver.records && options.records !== undefined && !isAddressEqual(owner, signer);
    // Fuses are burned after the hand-over, but the child gets the expiry they need now: an
    // emancipated child with no expiry would lose its owner at once.
    const emancipating = Arr.some(options.fuses ?? [], (fuse) => fuse === "parentCannotControl");
    const created = yield* v1Call(
      client,
      subname,
      handOver
        ? {
            ...options,
            fuses: undefined,
            expiry: options.expiry ?? (emancipating ? maxUint64 : undefined),
          }
        : options,
      { owner: handOver ? signer : owner, resolver: resolver.address, signer },
    );
    steps.push({
      id: "create",
      description: "Create subname",
      calls: [...(resolver.deploy === undefined ? [] : [resolver.deploy]), created.call],
    });
    if (handOver) {
      after.push(...(yield* handOverCalls(client, subname, options, owner, created.expiry)));
    }
  }
  if (resolver.deploy !== undefined) {
    deploys.push({ contract: "resolver", address: resolver.address });
  }

  // Records on an existing resolver are written once the child exists.
  if (resolver.records && options.records !== undefined) {
    steps.push({
      id: "records",
      description: "Set records",
      calls: [yield* recordsCall(client, resolver.address, child.data.parts, options.records)],
    });
  }
  if (after.length > 0) {
    steps.push({ id: "handover", description: "Hand over subname", calls: after });
  }

  return makePlan({
    operation: "subname.create",
    chainId: client.chain.id,
    account: signer,
    steps,
    deploys,
    warnings,
  });
});

const write = Action.write(
  "subname.create",
  plan,
  { contractKind: "registry" },
  explainFor(
    (options: { readonly name: string }) => parentOf(options.name),
    () => ["createSubname" as const],
  ),
);

/** @internal Implementation of `Actions.subname.create`. */
export const create = write.send;

/** @internal Implementation of `Actions.subname.createSync`. */
export const createSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.subname.create`. */
export const createMethods = write.methods;
