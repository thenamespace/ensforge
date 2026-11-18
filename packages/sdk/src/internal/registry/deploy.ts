import { Effect, Array as Arr, Record as Rec } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { encodeFunctionData, isAddressEqual, type Address } from "viem";

import type { Client } from "../../client/types.js";
import { UnsupportedError } from "../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import { deployProxy } from "../factory/verifiable-proxy.js";

// Every registry role and admin role, except the `wasReserved` marker the registry sets itself.
const allRegistryRoles = Arr.reduce(Rec.toEntries(Roles.registry), 0n, (bitmap, [name, role]) =>
  name === "wasReserved" ? bitmap : bitmap | role,
);

/**
 * Root roles for a new registry's owners. Not emancipated: the owners can create, renew, remove
 * and repoint children, and upgrade freely. Emancipated: everything except
 * `registryRoleBitmaps.unemancipated`, so children are safe from their parent.
 */
export const rootRoles = (emancipated: boolean): bigint =>
  emancipated ? allRegistryRoles & ~Roles.registryBitmaps.unemancipated : allRegistryRoles;

/** The deployment of a UserRegistry at a CREATE2 address, with root roles for `owners`. */
export const deployUserRegistry = Effect.fnUntraced(function* (
  client: Client,
  options: {
    readonly deployer: Address;
    readonly owners: readonly Address[];
    readonly emancipated: boolean;
    readonly salt: bigint;
    readonly grants?: readonly { readonly account: Address; readonly roleBitmap: bigint }[];
  },
): Effect.fn.Return<{ readonly call: Plan.Call; readonly address: Address }, AnyError> {
  const v2 = client.deployment.v2;
  if (v2 === undefined) {
    return yield* Effect.fail(
      new UnsupportedError({ code: "UNSUPPORTED_ON_DEPLOYMENT", feature: "ENSv2 registries" }),
    );
  }

  const roleBitmap = rootRoles(options.emancipated);
  const owners = Arr.dedupeWith(options.owners, isAddressEqual);
  return yield* deployProxy(client, {
    factory: v2.contracts.verifiableFactory,
    implementation: v2.implementations.userRegistry,
    deployer: options.deployer,
    salt: options.salt,
    data: encodeFunctionData({
      abi: Abis.v2.userRegistry,
      functionName: "initialize",
      args: [
        [...Arr.map(owners, (account) => ({ account, roleBitmap })), ...(options.grants ?? [])],
      ],
    }),
  });
});

/**
 * Calls that make `registry` the subregistry of a name: `setSubregistry` on the registry holding
 * the name, then `setParent` on the new registry so its canonical name is known. Detaching
 * (`registry = 0`) only clears the subregistry.
 */
export const attachCalls = (options: {
  readonly parentRegistry: Address;
  readonly tokenId: bigint;
  readonly label: string;
  readonly registry: Address;
  readonly detach: boolean;
}): readonly Plan.Call[] => [
  {
    to: options.parentRegistry,
    data: encodeFunctionData({
      abi: Abis.v2.permissionedRegistry,
      functionName: "setSubregistry",
      args: [options.tokenId, options.registry],
    }),
    value: 0n,
  },
  ...(options.detach
    ? []
    : [
        {
          to: options.registry,
          data: encodeFunctionData({
            abi: Abis.v2.userRegistry,
            functionName: "setParent",
            args: [options.parentRegistry, options.label],
          }),
          value: 0n,
        },
      ]),
];
