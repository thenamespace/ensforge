import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { hexToBigInt, type Address } from "viem";

import type { Client } from "../../client/types.js";
import { InvalidInputError } from "../../errors/classes/InvalidInputError.js";
import { NotFoundError } from "../../errors/classes/NotFoundError.js";
import type { AnyError } from "../../errors/types.js";
import { loadName } from "../name/load.js";
import { requireAddress, requireProtocol } from "../name/write.js";
import * as Rpc from "../rpc/index.js";

/** Where roles are read or changed: an ENSv2 registry or a PermissionedResolver. */
export type RoleTarget = {
  readonly target: "registry" | "resolver";
  readonly name?: string | undefined;
  readonly contract?: string | undefined;
  readonly root?: boolean | undefined;
};

/** The contract and EAC resource of a role target, plus the label ID for registry grants. */
export type ResolvedRoleTarget = {
  readonly contract: Address;
  /** `0n` for the root. */
  readonly resource: bigint;
  /** ID `grantRoles`/`revokeRoles` take on a registry (any ID of the name). */
  readonly anyId: bigint | undefined;
};

const invalid = (shortMessage: string) =>
  new InvalidInputError({
    code: "INVALID_RECORD_VALUE",
    field: "target",
    input: "target",
    shortMessage,
  });

/**
 * Resolves a role target. Registries hold roles per name and at the root; PermissionedResolver
 * roles per record go through `permission.setRecordAccess`, so resolvers are root-only here.
 */
export const resolveRoleTarget = Effect.fnUntraced(function* (
  client: Client,
  options: RoleTarget,
): Effect.fn.Return<ResolvedRoleTarget, AnyError> {
  const root = options.root === true;
  if (options.target === "resolver" && !root) {
    return yield* Effect.fail(
      invalid(
        "Resolver roles are per record; pass `root: true`, or use permission.setRecordAccess.",
      ),
    );
  }
  if (!root && options.name === undefined) {
    return yield* Effect.fail(invalid("Pass `name` for a name's roles, or `root: true`."));
  }

  const loaded = options.name === undefined ? undefined : yield* loadName(client, options.name);
  if (loaded !== undefined && options.target === "registry") {
    yield* requireProtocol(loaded, "v2", "roles");
  }
  const contract =
    options.contract !== undefined
      ? yield* requireAddress(options.contract, "contract")
      : options.target === "registry"
        ? loaded?.state.registry
        : loaded?.state.resolver;
  if (contract === undefined || contract === null) {
    return yield* Effect.fail(
      options.target === "resolver"
        ? new NotFoundError({ code: "RESOLVER_NOT_FOUND" })
        : invalid("Pass `name` or `contract`."),
    );
  }
  if (root) return { contract, resource: 0n, anyId: undefined };

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a name target was loaded above
  const anyId = hexToBigInt((loaded as NonNullable<typeof loaded>).data.parts.labelhash);
  // An explicit registry may not be the one holding the name: ask it for the resource.
  const resource =
    options.contract === undefined &&
    loaded?.state.resource !== null &&
    loaded?.state.resource !== undefined
      ? loaded.state.resource
      : yield* Rpc.readContract(client, {
          address: contract,
          abi: Abis.v2.permissionedRegistry,
          functionName: "getResource",
          args: [anyId],
        });
  return { contract, resource, anyId };
});
