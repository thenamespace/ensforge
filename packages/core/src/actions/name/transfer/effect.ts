import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import type { Deployments } from "@ensforge/contracts";
import { encodeFunctionData, hexToBigInt, type Address } from "viem";

import type { Client } from "../../../client/types.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { loadName, type LoadedName } from "../../../internal/name/load.js";
import {
  requireAddress,
  requireRegistered,
  requireV1Contracts,
  singleStepPlan,
} from "../../../internal/name/write.js";
import { explainFor } from "../../../internal/permission/check.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { transfer as Promises } from "./index.js";

const call = (to: Address, data: `0x${string}`): Plan.Call => ({ to, data, value: 0n });

const v2Calls = ({ state }: LoadedName, to: Address, unsafe: boolean): Plan.Call[] => {
  const registry = state.registry as Address;
  const tokenId = state.tokenId as bigint;

  return [
    call(
      registry,
      unsafe
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
  ];
};

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

/** @internal Builds the plan of `Actions.name.transfer`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const to = yield* requireAddress(options.to, "to");
  const loaded = yield* loadName(client, options.name);
  yield* requireRegistered(loaded);

  const calls =
    loaded.state.protocol === "v2"
      ? v2Calls(loaded, to, options.unsafe ?? false)
      : yield* v1Calls(yield* requireV1Contracts(client), loaded, to, options.role ?? "owner");

  return singleStepPlan(client, {
    operation: "name.transfer",
    account: options.account,
    description: "Transfer name",
    calls,
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
