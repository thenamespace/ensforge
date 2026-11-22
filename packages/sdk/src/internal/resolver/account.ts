import { Effect, Array as Arr } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { ownedResolverSalt } from "@ensforge/contracts/v2";
import { isAddressEqual, type Address } from "viem";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import * as Rpc from "../rpc/index.js";
import { deployPermissionedResolver } from "./deploy.js";

/**
 * The accounts that get every role on a PermissionedResolver `sender` deploys for `owner`. A
 * route's account (an HCA) only writes records the signer keeps, so it is a writer next to the
 * signer, first, as in the ENS app. Anyone else deploys for the owner alone.
 */
export const resolverWriters = (
  sender: Address,
  owner: Address,
  signer: Address,
): readonly [Address, ...Address[]] =>
  !isAddressEqual(sender, signer) && isAddressEqual(owner, signer) ? [sender, owner] : [owner];

/**
 * The shared PermissionedResolver of `account` (the signer, or the HCA it routes through): the
 * proxy `account` deploys with `ownedResolverSalt(account)`, the address the ENS app uses for a
 * wallet or an HCA. Its deployment is returned when it has no code yet. A resolver that exists
 * but does not give every writer the full role mask was created by ensforge 1.0 or 1.1; it stays
 * usable, with a warning.
 */
export const accountResolver = Effect.fnUntraced(function* (
  client: Client,
  options: { readonly account: Address; readonly writers: readonly [Address, ...Address[]] },
): Effect.fn.Return<
  {
    readonly address: Address;
    readonly deploy: Plan.Call | undefined;
    readonly warnings: readonly Plan.Warning[];
  },
  AnyError
> {
  const deployment = yield* deployPermissionedResolver(client, {
    deployer: options.account,
    writers: options.writers,
    salt: ownedResolverSalt(options.account),
  });
  if (!(yield* Rpc.hasCode(client, deployment.address))) {
    return { address: deployment.address, deploy: deployment.call, warnings: [] };
  }

  const complete = yield* Effect.forEach(
    options.writers,
    (writer) =>
      Rpc.readContractOrUndefined(client, {
        address: deployment.address,
        abi: Abis.v2.permissionedResolver,
        functionName: "hasRootRoles",
        args: [Roles.enhancedAccessControl.allRoles, writer],
      }),
    { concurrency: "unbounded" },
  );
  return {
    address: deployment.address,
    deploy: undefined,
    warnings: Arr.every(complete, (holds) => holds === true)
      ? []
      : [
          {
            code: "RESOLVER_ROLES_PARTIAL",
            message: `The shared resolver ${deployment.address} was created by ensforge 1.0 or 1.1 without every role. ensforge can still write its records, but the ENS app does not use it, and its roles cannot be widened.`,
          },
        ],
  };
});

/** The address of `account`'s shared PermissionedResolver (see {@link accountResolver}). */
export const accountResolverAddress = (
  client: Client,
  account: Address,
): Effect.Effect<Address, AnyError> =>
  deployPermissionedResolver(client, {
    deployer: account,
    writers: [account],
    salt: ownedResolverSalt(account),
  }).pipe(Effect.map((deployment) => deployment.address));
