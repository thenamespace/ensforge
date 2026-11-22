import { Effect, Array as Arr } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { encodeFunctionData, type Address } from "viem";

import type { Client } from "../../client/types.js";
import { UnsupportedError } from "../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import { tryAny } from "../anyError.js";
import { deployProxy } from "../factory/verifiable-proxy.js";
import type { NameParts } from "../name/parts.js";
import {
  encodeRecordWrites,
  recordWriteCodecs,
  type RecordWrites,
} from "../records/write-profiles.js";

/**
 * The deployment of an ENSv2 PermissionedResolver at a CREATE2 address: each of `writers` gets
 * every role, in order (plus `grants`), and `records` for `name` are written during `initialize`,
 * when role checks do not apply.
 */
export const deployPermissionedResolver = Effect.fnUntraced(function* (
  client: Client,
  options: {
    readonly deployer: Address;
    readonly writers: readonly [Address, ...Address[]];
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
  const recordCalls =
    name === undefined || records === undefined
      ? []
      : yield* recordWriteCodecs(records).pipe(
          Effect.flatMap((codecs) =>
            tryAny(() => encodeRecordWrites("name", name, records, codecs)),
          ),
        );
  return yield* deployProxy(client, {
    factory: v2.contracts.verifiableFactory,
    implementation: v2.implementations.permissionedResolver,
    deployer: options.deployer,
    salt: options.salt,
    data: encodeFunctionData({
      abi: Abis.v2.permissionedResolver,
      functionName: "initialize",
      args: [
        [
          // The full mask, not only the roles defined today: the ENS app requires it, and an
          // account can never grant itself the admin roles it was not given here.
          ...Arr.map(options.writers, (account) => ({
            account,
            roleBitmap: Roles.enhancedAccessControl.allRoles,
          })),
          ...(options.grants ?? []),
        ],
        recordCalls,
      ],
    }),
  });
});
