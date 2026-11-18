import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import type { Deployments } from "@ensforge/contracts";
import { ownedResolverSalt } from "@ensforge/contracts/v2";
import { encodeFunctionData, hexToBigInt, isAddressEqual, type Address } from "viem";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { addressOf } from "../../../internal/address.js";
import { loadName, type LoadedName } from "../../../internal/name/load.js";
import {
  requireAddress,
  requireRegistered,
  requireV1Contracts,
} from "../../../internal/name/write.js";
import { explainFor } from "../../../internal/permission/check.js";
import { setterKeying } from "../../../internal/records/setter-keying.js";
import { deployPermissionedResolver } from "../../../internal/resolver/deploy.js";
import * as Rpc from "../../../internal/rpc/index.js";
import { make as makePlan } from "../../../plan/make.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
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

  // The signer's shared resolver serves its other names too; handing it over would give them away.
  const owned = yield* deployPermissionedResolver(client, {
    deployer: sender,
    owner: sender,
    salt: ownedResolverSalt(sender),
  });
  if (isAddressEqual(owned.address, resolver)) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_RECORD_VALUE",
        field: "records",
        input: records,
        shortMessage:
          "The name uses the sender's shared resolver; its roles cover other names too.",
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
    warnings: [],
  };
});

/** @internal Builds the plan of `Actions.name.transfer`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const to = yield* requireAddress(options.to, "to");
  const loaded = yield* loadName(client, options.name);
  yield* requireRegistered(loaded);

  const { state } = loaded;
  const tokenId = state.tokenId as bigint;
  const calls =
    state.protocol === "v2"
      ? [
          call(
            state.registry as Address,
            options.unsafe
              ? encodeFunctionData({
                  abi: Abis.v2.permissionedRegistry,
                  functionName: "unsafeTransfer",
                  args: [to, tokenId, "0x"],
                })
              : encodeFunctionData({
                  abi: Abis.v2.permissionedRegistry,
                  functionName: "safeTransferFrom",
                  args: [state.owner as Address, to, tokenId, 1n, "0x"],
                }),
          ),
        ]
      : yield* v1Calls(yield* requireV1Contracts(client), loaded, to, options.role ?? "owner");
  const sender = addressOf(options.account) ?? client.account;
  const control = yield* recordControl(client, loaded, sender, to, options.records ?? "keep");

  return makePlan({
    operation: "name.transfer",
    chainId: client.chain.id,
    account: sender,
    steps: [
      {
        id: "write",
        description: "Transfer name",
        calls: [...control.before, ...calls, ...control.after],
      },
    ],
    warnings: control.warnings,
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
