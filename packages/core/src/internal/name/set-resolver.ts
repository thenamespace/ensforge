import { Effect } from "effect";

import { encodeFunctionData, type Address } from "viem";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import { ensRegistryAbi, nameWrapperAbi } from "../abis/v1.js";
import { permissionedRegistryAbi } from "../abis/v2.js";
import type { LoadedName } from "./load.js";
import { requireV1Contracts } from "./write.js";

/** The call that points a registered name at `resolver`, routed by where the name lives. */
export const setResolverCall = (
  client: Client,
  { state, data }: LoadedName,
  resolver: Address,
): Effect.Effect<Plan.Call, AnyError> => {
  if (state.protocol === "v2") {
    return Effect.succeed({
      to: state.registry as Address,
      data: encodeFunctionData({
        abi: permissionedRegistryAbi,
        functionName: "setResolver",
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
              abi: nameWrapperAbi,
              functionName: "setResolver",
              args: [data.parts.node, resolver],
            }),
            value: 0n,
          }
        : {
            to: contracts.registry,
            data: encodeFunctionData({
              abi: ensRegistryAbi,
              functionName: "setResolver",
              args: [data.parts.node, resolver],
            }),
            value: 0n,
          },
    ),
  );
};
