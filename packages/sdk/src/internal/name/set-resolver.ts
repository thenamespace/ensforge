import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, type Address } from "viem";

import type { Client } from "../../client/types.js";
import { UnsupportedError } from "../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import type { LoadedName } from "./load.js";
import { requireAddress, requireV1Contracts } from "./write.js";

/** The call that points a registered name at `resolver`, routed by where the name lives. */
export const setResolverCall = (
  client: Client,
  { state, data }: LoadedName,
  resolver: Address,
): Effect.Effect<Plan.Call, AnyError> => {
  if (state.protocol === "v2") {
    return Effect.succeed({
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a v2 or wrapped name's state always carries this field; `Name.State` types it as nullable for every protocol
      to: state.registry as Address,
      data: encodeFunctionData({
        abi: Abis.v2.permissionedRegistry,
        functionName: "setResolver",
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a v2 or wrapped name's state always carries this field; `Name.State` types it as nullable for every protocol
        args: [state.tokenId as bigint, resolver],
      }),
      value: 0n,
    });
  }

  return requireV1Contracts(client).pipe(
    Effect.map((contracts) =>
      state.wrapped
        ? {
            to: contracts.nameWrapper,
            data: encodeFunctionData({
              abi: Abis.v1.nameWrapper,
              functionName: "setResolver",
              args: [data.parts.node, resolver],
            }),
            value: 0n,
          }
        : {
            to: contracts.registry,
            data: encodeFunctionData({
              abi: Abis.v1.ensRegistry,
              functionName: "setResolver",
              args: [data.parts.node, resolver],
            }),
            value: 0n,
          },
    ),
  );
};

/**
 * The resolver a `resolver` option asks for. `"default"` is the ENSv1 public resolver: the ENSv2
 * PublicResolverV2 only authorizes names known to the NameWrapper, and ENSv2 names otherwise get
 * a PermissionedResolver of their own.
 */
export const requestedResolver = (
  client: Client,
  { state }: LoadedName,
  resolver: string,
): Effect.Effect<Address, AnyError> => {
  if (resolver !== "default") return requireAddress(resolver, "resolver");
  if (state.protocol === "v2") {
    return Effect.fail(
      new UnsupportedError({
        code: "UNSUPPORTED_PROTOCOL",
        protocol: "v2",
        feature: "the default resolver",
        hint: "Pass the address of a resolver, e.g. a PermissionedResolver deployed for the name.",
      }),
    );
  }
  return requireV1Contracts(client).pipe(Effect.map((contracts) => contracts.publicResolver));
};
