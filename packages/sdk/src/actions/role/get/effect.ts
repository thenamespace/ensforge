import { Effect, Array as Arr, String as Str } from "effect";

import { Abis } from "@ensforge/contracts";

import type { Client } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { requireAddress } from "../../../internal/name/write.js";
import { resolveRoleTarget } from "../../../internal/role/target.js";
import { blockAt } from "../../../internal/rpc/block.js";
import * as Rpc from "../../../internal/rpc/index.js";
import * as Role from "../../../utils/Role.js";
import type { get as Promises } from "./index.js";

/** @internal Implementation of `Actions.role.get`. */
export const get = Effect.fn("ensforge.role.get")(
  function* (
    client: Client,
    options: Promises.Options,
  ): Effect.fn.Return<Promises.ReturnType, AnyError> {
    const account = yield* requireAddress(options.account, "account");
    const { contract, resource } = yield* resolveRoleTarget(client, options);
    const at = blockAt(options);
    const read = (on: bigint) =>
      Rpc.readContract(client, {
        address: contract,
        abi: Abis.v2.permissionedRegistry,
        functionName: "roles",
        args: [on, account],
        ...at,
      });

    // Root roles apply to every resource, so a name's effective roles include them.
    const { own, root } = yield* Effect.all(
      { own: resource === 0n ? Effect.succeed(0n) : read(resource), root: read(0n) },
      { concurrency: "unbounded" },
    );
    const roles = own | root;
    const names = Role.toNames(roles, options.target);

    return {
      contract,
      resource,
      roles,
      rootRoles: root,
      names: Arr.filter(names, (name) => !Str.endsWith("Admin")(name)),
      admin: Arr.filter(names, (name) => Str.endsWith("Admin")(name)),
    };
  },
  Action.withContext("role.get", { contractKind: "registry" }),
);
