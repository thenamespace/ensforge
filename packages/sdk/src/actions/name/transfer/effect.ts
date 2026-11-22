import { Effect, Array as Arr } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import type { Deployments } from "@ensforge/contracts";
import { encodeFunctionData, hexToBigInt, isAddressEqual, type Address } from "viem";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { NameStateError } from "../../../errors/classes/NameStateError.js";
import { UnauthorizedError } from "../../../errors/classes/UnauthorizedError.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { addressOf } from "../../../internal/address.js";
import { loadName, type LoadedName } from "../../../internal/name/load.js";
import {
  l2WriteTargetOf,
  requireAddress,
  requireRegistered,
  requireV1Contracts,
} from "../../../internal/name/write.js";
import { checkLoaded, explainFor } from "../../../internal/permission/check.js";
import { setterKeying } from "../../../internal/records/setter-keying.js";
import { recordsCall } from "../../../internal/records/write-call.js";
import { delegatesOf, regeneratedTokenId } from "../../../internal/registry/delegates.js";
import { resolverSharing } from "../../../internal/resolver/sharing.js";
import * as Rpc from "../../../internal/rpc/index.js";
import { make as makePlan } from "../../../plan/make.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Role from "../../../utils/Role.js";
import type { transfer as Promises } from "./index.js";

const call = (to: Address, data: `0x${string}`): Plan.Call => ({ to, data, value: 0n });

const v1Calls = (
  contracts: Deployments.V1Contracts,
  loaded: LoadedName,
  to: Address,
  role: "owner" | "registrant",
): Effect.Effect<Plan.Call[], AnyError> => {
  const { state, data } = loaded;

  if (state.wrapped) {
    return Effect.succeed([
      call(
        contracts.nameWrapper,
        encodeFunctionData({
          abi: Abis.v1.nameWrapper,
          functionName: "safeTransferFrom",
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a v2 or wrapped name's state always carries this field; `Name.State` types it as nullable for every protocol
          args: [state.owner as Address, to, hexToBigInt(data.parts.node), 1n, "0x"],
        }),
      ),
    ]);
  }

  if (data.parts.isEth2ld) {
    const tokenId = hexToBigInt(data.parts.labelhash);
    const moveToken = call(
      contracts.baseRegistrar,
      encodeFunctionData({
        abi: Abis.v1.baseRegistrar,
        functionName: "safeTransferFrom",
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a v2 or wrapped name's state always carries this field; `Name.State` types it as nullable for every protocol
        args: [state.registrant as Address, to, tokenId],
      }),
    );
    // Reclaim first: only the current registrant may point the registry owner (manager) at `to`.
    const reclaim = call(
      contracts.baseRegistrar,
      encodeFunctionData({
        abi: Abis.v1.baseRegistrar,
        functionName: "reclaim",
        args: [tokenId, to],
      }),
    );
    return Effect.succeed(role === "registrant" ? [moveToken] : [reclaim, moveToken]);
  }

  if (role === "registrant") {
    return Effect.fail(
      new UnsupportedError({
        code: "UNSUPPORTED_PROTOCOL",
        protocol: "v1",
        feature: "registrant transfers of names other than .eth second-level names",
      }),
    );
  }
  return Effect.succeed([
    call(
      contracts.registry,
      encodeFunctionData({
        abi: Abis.v1.ensRegistry,
        functionName: "setOwner",
        args: [data.parts.node, to],
      }),
    ),
  ]);
};

/**
 * ENSv2 names keep their PermissionedResolver roles with the sender after a transfer: resolver
 * roles are not tied to registry ownership. `handover` moves the sender's root roles to the
 * recipient around the transfer; `keep` leaves them and warns.
 */
const recordControl = Effect.fnUntraced(function* (
  client: Client,
  loaded: LoadedName,
  sender: Address | undefined,
  to: Address,
  records: "keep" | "handover",
): Effect.fn.Return<
  {
    readonly before: Plan.Call[];
    readonly after: Plan.Call[];
    readonly warnings: Plan.Warning[];
  },
  AnyError
> {
  const none = { before: [], after: [], warnings: [] };
  const resolver = loaded.state.resolver;
  // The sender's root roles on the name's ENSv2 PermissionedResolver; none on anything else.
  const roles =
    loaded.state.protocol === "v2" &&
    resolver !== null &&
    sender !== undefined &&
    (yield* setterKeying(client, resolver)) === "name"
      ? yield* Rpc.readContract(client, {
          address: resolver,
          abi: Abis.v2.permissionedResolver,
          functionName: "roles",
          args: [0n, sender],
        })
      : 0n;
  if (roles === 0n || resolver === null || sender === undefined) {
    if (records === "keep") return none;
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_RECORD_VALUE",
        field: "records",
        input: "handover",
        shortMessage:
          "Nothing to hand over: the sender holds no roles on an ENSv2 PermissionedResolver for the name.",
      }),
    );
  }

  if (records === "keep") {
    return {
      ...none,
      warnings: [
        {
          code: "RECORD_CONTROL_RETAINED",
          message:
            'The sender keeps its roles on the name\'s PermissionedResolver and can still edit its records; pass `records: "handover"` to move them.',
        },
      ],
    };
  }

  // Resolver roles cover every name on the resolver, so only a resolver of this name alone is
  // handed over.
  const sharing = yield* resolverSharing(client, {
    resolver,
    name: loaded.data.parts.name,
    node: loaded.data.parts.node,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a v2 name's state always carries its owner; `Name.State` types it as nullable for every protocol
    accounts: Arr.dedupeWith([sender, loaded.state.owner as Address], isAddressEqual),
  });
  if (sharing.problem !== undefined) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_RECORD_VALUE",
        field: "records",
        input: records,
        shortMessage: sharing.problem,
        hint: "Give the name its own resolver first, or grant record access with permission.setRecordAccess.",
      }),
    );
  }

  const rolesCall = (functionName: "grantRootRoles" | "revokeRootRoles", account: Address) =>
    call(
      resolver,
      encodeFunctionData({
        abi: Abis.v2.permissionedResolver,
        functionName,
        args: [roles, account],
      }),
    );
  return {
    before: [rolesCall("grantRootRoles", to)],
    after: [rolesCall("revokeRootRoles", sender)],
    warnings: [...sharing.warnings],
  };
});

/**
 * The v2 move: revocations of others' roles (with `delegates: "revoke"`), then the transfer of
 * the token ID they leave. A safe transfer needs an emancipated registry and the owner as the
 * only holder of its unemancipated roles (checked against the token ID, as the registry does);
 * `"auto"` falls back to `unsafeTransfer`, which still checks the receiver, and says why.
 */
const v2Calls = Effect.fnUntraced(function* (
  client: Client,
  loaded: LoadedName,
  options: {
    readonly to: Address;
    readonly sender: Address | undefined;
    readonly unsafe: boolean | "auto";
    readonly delegates: "keep" | "revoke";
    readonly warnings: Plan.Warning[];
  },
): Effect.fn.Return<Plan.Call[], AnyError> {
  const { state, data } = loaded;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a v2 name's state always carries these fields; `Name.State` types them as nullable for every protocol
  const [registry, tokenId, owner, resource] = [
    state.registry,
    state.tokenId,
    state.owner,
    state.resource,
  ] as [Address, bigint, Address, bigint];
  const read = { address: registry, abi: Abis.v2.permissionedRegistry } as const;

  const { delegates, emancipated, onlyAssignee } = yield* Effect.all(
    {
      delegates: delegatesOf(client, {
        name: data.parts.name,
        registry,
        resource,
        tokenId,
        owner,
        sender: options.sender ?? owner,
        revoke: options.delegates === "revoke",
      }),
      emancipated: Rpc.readContract(client, { ...read, functionName: "isEmancipated" }),
      onlyAssignee: Rpc.readContract(client, {
        ...read,
        functionName: "isOnlyAssignee",
        args: [tokenId, Roles.registryBitmaps.unemancipated, owner],
      }),
    },
    { concurrency: "unbounded" },
  );
  if (delegates.retained !== 0n) {
    options.warnings.push({
      code: "ROLES_RETAINED",
      message: `Other accounts keep ${Arr.join(Role.toNames(delegates.retained, "registry"), ", ")} on ${data.parts.name} after the transfer.`,
    });
  }

  // A regenerated token fails the registry's single-assignee check whatever its holders, so a
  // transfer after revocations is never a safe one (contracts-v2 v1.0.1).
  const safe = emancipated && onlyAssignee && delegates.regenerations === 0;
  const reason = !emancipated
    ? "The registry is not emancipated: its root role holders keep control of the name."
    : "Other accounts hold roles on the name, or held them since its token was last minted.";
  if (options.unsafe === false && !safe) {
    return yield* Effect.fail(
      !emancipated
        ? new NameStateError({ code: "REGISTRY_NOT_EMANCIPATED", shortMessage: reason })
        : new UnauthorizedError({
            code: "TRANSFER_DISALLOWED",
            shortMessage: reason,
            hint: 'Revoke the other roles (`delegates: "revoke"`), or transfer with `unsafe: "auto"`.',
          }),
    );
  }
  const unsafe = options.unsafe === true || !safe;
  if (unsafe && options.unsafe === "auto") {
    options.warnings.push({ code: "TRANSFER_UNSAFE", message: reason });
  }

  const moved = regeneratedTokenId(tokenId, delegates.regenerations);
  return [
    ...delegates.revokes,
    call(
      registry,
      unsafe
        ? encodeFunctionData({
            ...read,
            functionName: "unsafeTransfer",
            args: [options.to, moved, "0x"],
          })
        : encodeFunctionData({
            ...read,
            functionName: "safeTransferFrom",
            args: [owner, options.to, moved, 1n, "0x"],
          }),
    ),
  ];
});

/**
 * The write of `to` as the name's ETH address on its current resolver, or a warning when the
 * sender cannot write there (no resolver, or a resolver whose permissions refuse or are unknown).
 */
const ethAddressCall = Effect.fnUntraced(function* (
  client: Client,
  loaded: LoadedName,
  sender: Address | undefined,
  to: Address,
): Effect.fn.Return<
  { readonly calls: readonly Plan.Call[]; readonly warnings: readonly Plan.Warning[] },
  AnyError
> {
  const resolver = loaded.state.resolver;
  const skipped = (why: string) => ({
    calls: [],
    warnings: [
      {
        code: "ETH_ADDRESS_NOT_SET",
        message: `The ETH address of ${loaded.data.parts.name} is not changed: ${why}.`,
      },
    ],
  });
  if (resolver === null) return skipped("it has no resolver");
  if (sender === undefined) return skipped("no signer is known");
  const [check] = yield* checkLoaded(client, loaded, sender, [{ setRecord: "address", key: 60n }]);
  if (check?.allowed !== true) return skipped("the sender cannot write its resolver");
  const write = yield* recordsCall(client, resolver, loaded.data.parts, { addresses: { eth: to } });
  return { calls: [write], warnings: [] };
});

/** @internal Builds the plan of `Actions.name.transfer`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const to = yield* requireAddress(options.to, "to");
  const loaded = yield* loadName(client, options.name);
  const sender = addressOf(options.account) ?? client.account;

  // A name ENS does not hold may live on an L2: its token moves there.
  const l2 = yield* l2WriteTargetOf(client, loaded);
  if (l2 !== null) {
    if (options.records === "handover") {
      return yield* Effect.fail(
        new InvalidInputError({
          code: "INVALID_RECORD_VALUE",
          field: "records",
          input: "handover",
          shortMessage:
            "Nothing to hand over: the records of an L2 name follow its owner on their own.",
        }),
      );
    }
    const { l2TransferCalls } = yield* Effect.promise(
      () => import("../../../internal/namespace/l2/index.js"),
    );
    const calls = yield* l2TransferCalls(l2, loaded.data.parts, to, options.role ?? "owner");
    return makePlan({
      operation: "name.transfer",
      chainId: l2.client.chain.id,
      account: sender,
      steps: [{ id: "write", description: "Transfer name", calls }],
    });
  }
  yield* requireRegistered(client, loaded);

  const { state } = loaded;
  const warnings: Plan.Warning[] = [];
  const calls =
    state.protocol === "v2"
      ? yield* v2Calls(client, loaded, {
          to,
          sender,
          unsafe: options.unsafe ?? "auto",
          delegates: options.delegates ?? "keep",
          warnings,
        })
      : yield* requireV1Contracts(client).pipe(
          Effect.flatMap((contracts) => v1Calls(contracts, loaded, to, options.role ?? "owner")),
        );
  // The recipient's address is written first, while the sender still controls the records.
  const ethAddress =
    options.setEthAddress === true
      ? yield* ethAddressCall(client, loaded, sender, to)
      : { calls: [], warnings: [] };
  warnings.push(...ethAddress.warnings);
  const control = yield* recordControl(client, loaded, sender, to, options.records ?? "keep");

  return makePlan({
    operation: "name.transfer",
    chainId: client.chain.id,
    account: sender,
    steps: [
      {
        id: "write",
        description: "Transfer name",
        calls: [...ethAddress.calls, ...control.before, ...calls, ...control.after],
      },
    ],
    warnings: [...warnings, ...control.warnings],
  });
});

const write = Action.write(
  "name.transfer",
  plan,
  { contractKind: "registry" },
  explainFor(
    (options) => options.name,
    () => ["transfer" as const],
  ),
);

/** @internal Implementation of `Actions.name.transfer`. */
export const transfer = write.send;

/** @internal Implementation of `Actions.name.transferSync`. */
export const transferSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.name.transfer`. */
export const transferMethods = write.methods;
