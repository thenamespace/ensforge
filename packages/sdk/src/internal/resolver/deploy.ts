import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, type Address } from "viem";

import type { Client } from "../../client/types.js";
import { UnsupportedError } from "../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import * as Role from "../../utils/Role.js";
import { deployProxy } from "../factory/verifiable-proxy.js";
import type { NameParts } from "../name/parts.js";
import { encodeRecordWrites, type RecordWrites } from "../records/write-profiles.js";

/** Every PermissionedResolver role and its admin role: what a resolver's owner gets. */
export const allResolverRoles = Object.values(Role.resolver).reduce(
  (bitmap, role) => bitmap | role,
  0n,
);

/**
 * The deployment of an ENSv2 PermissionedResolver at a CREATE2 address: `owner` gets every role
 * (plus `grants`), and `records` for `name` are written during `initialize`, when role checks do
 * not apply.
 */
export const deployPermissionedResolver = Effect.fnUntraced(function* (
  client: Client,
  options: {
    readonly deployer: Address;
    readonly owner: Address;
    readonly salt: bigint;
    readonly grants?: readonly { readonly account: Address; readonly roleBitmap: bigint }[];
    readonly name?: NameParts | undefined;
    readonly records?: Omit<RecordWrites, "clear" | "pubkey"> | undefined;
  },
): Effect.fn.Return<{ readonly call: Plan.Call; readonly address: Address }, AnyError> {
  const v2 = client.deployment.v2;
  if (v2 === undefined) {
    return yield* Effect.fail(
      new UnsupportedError({ code: "UNSUPPORTED_ON_DEPLOYMENT", feature: "PermissionedResolver" }),
    );
  }

  const { name, records } = options;
  const calls =
    name === undefined || records === undefined
      ? []
      : yield* Effect.try({
          try: () => encodeRecordWrites("name", name, records),
          catch: (error) => error as AnyError,
        });
  return yield* deployProxy(client, {
    factory: v2.contracts.verifiableFactory,
    implementation: v2.implementations.permissionedResolver,
    deployer: options.deployer,
    salt: options.salt,
    data: encodeFunctionData({
      abi: Abis.v2.permissionedResolver,
      functionName: "initialize",
      args: [
        [{ account: options.owner, roleBitmap: allResolverRoles }, ...(options.grants ?? [])],
        calls,
      ],
    }),
  });
});
