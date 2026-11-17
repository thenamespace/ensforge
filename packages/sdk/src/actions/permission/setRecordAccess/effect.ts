import { Effect } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { encodeFunctionData, zeroAddress, type Address, type Hex } from "viem";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { NotFoundError } from "../../../errors/classes/NotFoundError.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { loadName, type LoadedName } from "../../../internal/name/load.js";
import { requireAddress, singleStepPlan } from "../../../internal/name/write.js";
import { recordResource } from "../../../internal/permission/facts.js";
import { recordRoles, selectionOperations } from "../../../internal/permission/records.js";
import { setterKeying } from "../../../internal/records/setter-keying.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { RecordOperation } from "../get/types.js";
import type { setRecordAccess as Promises } from "./index.js";

/**
 * The setter call `grantSetterRoles` decodes into the resource and role of one keyed record.
 * The values are placeholders; only the setter and its argument matter.
 */
const setterCall = (dns: Hex, operation: RecordOperation & { key: string | bigint | Hex }): Hex => {
  const abi = Abis.v2.permissionedResolver;
  switch (operation.setRecord) {
    case "text":
      return encodeFunctionData({
        abi,
        functionName: "setText",
        args: [dns, String(operation.key), ""],
      });
    case "data":
      return encodeFunctionData({
        abi,
        functionName: "setData",
        args: [dns, String(operation.key), "0x"],
      });
    case "address":
      return encodeFunctionData({
        abi,
        functionName: "setAddress",
        args: [dns, BigInt(operation.key), "0x"],
      });
    case "abi":
      return encodeFunctionData({
        abi,
        functionName: "setABI",
        args: [dns, BigInt(operation.key), "0x"],
      });
    default:
      return encodeFunctionData({
        abi,
        functionName: "setInterface",
        args: [dns, operation.key as Hex, zeroAddress],
      });
  }
};

/** PermissionedResolver: exact setter roles per record, or every setter role at the root. */
const permissionedCalls = Effect.fnUntraced(function* (
  resolver: Address,
  loaded: LoadedName,
  options: Promises.Options,
  grantee: Address,
): Effect.fn.Return<Plan.Call[], AnyError> {
  const abi = Abis.v2.permissionedResolver;
  const call = (data: Hex): Plan.Call => ({ to: resolver, data, value: 0n });
  const revoke = options.revoke === true;

  if (options.records === undefined || options.records === "all") {
    // Root roles cover every record of every name on this resolver.
    if (options.allowScopeWidening !== true && !revoke) {
      return yield* Effect.fail(
        new InvalidInputError({
          code: "INVALID_RECORD_VALUE",
          field: "allowScopeWidening",
          input: false,
          shortMessage: "Access to all records applies to every name on this resolver.",
          hint: "Pass `allowScopeWidening: true` to confirm.",
        }),
      );
    }
    const setterRoles =
      Roles.resolver.setAddr |
      Roles.resolver.setText |
      Roles.resolver.setContenthash |
      Roles.resolver.setAbi |
      Roles.resolver.setInterface |
      Roles.resolver.setName |
      Roles.resolver.setData;
    return [
      call(
        encodeFunctionData({
          abi,
          functionName: revoke ? "revokeRootRoles" : "grantRootRoles",
          args: [setterRoles, grantee],
        }),
      ),
    ];
  }

  const operations = yield* selectionOperations(options.records);
  const calls: Plan.Call[] = [];
  for (const { operation } of operations) {
    if (operation.setRecord === "pubkey") {
      return yield* Effect.fail(
        new UnsupportedError({
          code: "RESOLVER_PROFILE_UNSUPPORTED",
          feature: "public key records",
        }),
      );
    }
    const role = Roles.resolver[recordRoles[operation.setRecord]];
    // Content hash, name and "any ABI" records only exist at the root.
    if (operation.key === undefined) {
      calls.push(
        call(
          encodeFunctionData({
            abi,
            functionName: revoke ? "revokeRootRoles" : "grantRootRoles",
            args: [role, grantee],
          }),
        ),
      );
    } else if (revoke) {
      calls.push(
        call(
          encodeFunctionData({
            abi,
            functionName: "revokeRoles",
            args: [recordResource(operation), role, grantee],
          }),
        ),
      );
    } else {
      const keyed = operation as RecordOperation & { key: string | bigint | Hex };
      calls.push(
        call(
          encodeFunctionData({
            abi,
            functionName: "grantSetterRoles",
            args: [setterCall(loaded.data.parts.dns, keyed), grantee],
          }),
        ),
      );
    }
  }
  return calls;
});

/** @internal Builds the plan of `Actions.permission.setRecordAccess`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const grantee = yield* requireAddress(options.grantee, "grantee");
  const loaded = yield* loadName(client, options.name);
  const resolver = loaded.state.resolver;
  if (resolver === null) {
    return yield* Effect.fail(new NotFoundError({ code: "RESOLVER_NOT_FOUND" }));
  }

  let calls: Plan.Call[];
  if ((yield* setterKeying(client, resolver)) === "name") {
    calls = yield* permissionedCalls(resolver, loaded, options, grantee);
  } else {
    // A PublicResolver delegate can write every record of the name.
    if (options.allowScopeWidening !== true && options.revoke !== true) {
      return yield* Effect.fail(
        new InvalidInputError({
          code: "INVALID_RECORD_VALUE",
          field: "allowScopeWidening",
          input: false,
          shortMessage: "A PublicResolver delegate can edit every record of the name.",
          hint: "Pass `allowScopeWidening: true` to confirm.",
        }),
      );
    }
    calls = [
      {
        to: resolver,
        data: encodeFunctionData({
          abi: Abis.v1.publicResolver,
          functionName: "approve",
          args: [loaded.data.parts.node, grantee, options.revoke !== true],
        }),
        value: 0n,
      },
    ];
  }

  return singleStepPlan(client, {
    operation: "permission.setRecordAccess",
    account: options.account,
    description: options.revoke === true ? "Revoke record access" : "Grant record access",
    calls,
  });
});

const write = Action.write("permission.setRecordAccess", plan, { contractKind: "resolver" });

/** @internal Implementation of `Actions.permission.setRecordAccess`. */
export const setRecordAccess = write.send;

/** @internal Implementation of `Actions.permission.setRecordAccessSync`. */
export const setRecordAccessSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.permission.setRecordAccess`. */
export const setRecordAccessMethods = write.methods;
