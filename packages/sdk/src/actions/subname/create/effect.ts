import { Effect } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { encodeFunctionData, hexToBigInt, maxUint64, zeroAddress, type Address } from "viem";

import type { Client } from "../../../client/types.js";
import { ConfigError } from "../../../errors/classes/ConfigError.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { NameStateError } from "../../../errors/classes/NameStateError.js";
import { NotFoundError } from "../../../errors/classes/NotFoundError.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { randomSalt } from "../../../internal/factory/verifiable-proxy.js";
import { requireAddress, requireV1Contracts } from "../../../internal/name/write.js";
import { explainFor } from "../../../internal/permission/check.js";
import { recordsCall } from "../../../internal/records/write-call.js";
import { attachCalls, deployUserRegistry } from "../../../internal/registry/deploy.js";
import { deployPermissionedResolver } from "../../../internal/resolver/deploy.js";
import { roleBitmapOf } from "../../../internal/role/bitmap.js";
import { loadSubname, type LoadedSubname } from "../../../internal/subname/load.js";
import { addressOf } from "../../../internal/write/signer.js";
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

  const deployment = yield* deployPermissionedResolver(client, {
    deployer: signer,
    owner,
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
    attach = attachCalls({
      parentRegistry: parent.state.registry as Address,
      tokenId: parent.state.tokenId as bigint,
      label: parent.data.parts.label,
      registry,
      detach: false,
    });
  }

  const exists = child.state.status === "registered";
  const roleBitmap =
    options.roles === undefined
      ? Roles.registryBitmaps.registration
      : yield* roleBitmapOf(options.roles);
  const write: Plan.Call = exists
    ? {
        to: registry,
        data: encodeFunctionData({
          abi: Abis.v2.permissionedRegistry,
          functionName: "setResolver",
          args: [labelId, context.resolver],
        }),
        value: 0n,
      }
    : {
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
      };
  steps.push({
    id: "create",
    description: exists ? "Update subname" : "Create subname",
    calls: [...attach, write],
  });
  return { steps, registry: deployRegistry === undefined ? undefined : registry, deployRegistry };
});

/** ENSv1: one `setSubnodeRecord`, on the ENS registry or, for wrapped parents, the NameWrapper. */
const v1Call = Effect.fnUntraced(function* (
  client: Client,
  subname: LoadedSubname,
  options: Promises.Options,
  context: { readonly owner: Address; readonly resolver: Address },
): Effect.fn.Return<Plan.Call, AnyError> {
  const contracts = yield* requireV1Contracts(client);
  const { parent, child, label } = subname;

  if (subname.route === "v1") {
    return {
      to: contracts.registry,
      data: encodeFunctionData({
        abi: Abis.v1.ensRegistry,
        functionName: "setSubnodeRecord",
        args: [
          parent.data.parts.node,
          child.data.parts.labelhash,
          context.owner,
          context.resolver,
          0n,
        ],
      }),
      value: 0n,
    };
  }

  const fuses = yield* Effect.try({
    try: () => Fuse.from(options.fuses ?? []),
    catch: (error) => error as AnyError,
  });
  // As in ensjs: an emancipated child needs an expiry (capped at the parent's by the wrapper).
  const expiry = options.expiry ?? (Fuse.has(fuses, "parentCannotControl") ? maxUint64 : 0n);
  return {
    to: contracts.nameWrapper,
    data: encodeFunctionData({
      abi: Abis.v1.nameWrapper,
      functionName: "setSubnodeRecord",
      args: [parent.data.parts.node, label, context.owner, context.resolver, 0n, fuses, expiry],
    }),
    value: 0n,
  };
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

  if (route === "v2") {
    const v2 = yield* v2Steps(client, subname, options, {
      owner,
      signer,
      resolver: resolver.address,
    });
    // Deployments come first, in one step: the attach and register calls need the code.
    const deployCalls = [v2.deployRegistry, resolver.deploy].filter((call) => call !== undefined);
    if (deployCalls.length > 0) {
      steps.push({ id: "deploy", description: "Deploy contracts", calls: deployCalls });
    }
    steps.push(...v2.steps);
    if (v2.registry !== undefined) deploys.push({ contract: "registry", address: v2.registry });
  } else {
    const call = yield* v1Call(client, subname, options, { owner, resolver: resolver.address });
    steps.push({
      id: "create",
      description: child.state.status === "registered" ? "Update subname" : "Create subname",
      calls: [...(resolver.deploy === undefined ? [] : [resolver.deploy]), call],
    });
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

  return makePlan({
    operation: "subname.create",
    chainId: client.chain.id,
    account: signer,
    steps,
    deploys,
  });
});

const write = Action.write(
  "subname.create",
  plan,
  { contractKind: "registry" },
  explainFor(
    (options: { readonly name: string }) => options.name.slice(options.name.indexOf(".") + 1),
    () => ["createSubname" as const],
  ),
);

/** @internal Implementation of `Actions.subname.create`. */
export const create = write.send;

/** @internal Implementation of `Actions.subname.createSync`. */
export const createSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.subname.create`. */
export const createMethods = write.methods;
