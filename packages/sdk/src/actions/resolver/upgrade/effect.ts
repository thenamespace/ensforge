import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import {
  encodeFunctionData,
  getAddress,
  isAddressEqual,
  sliceHex,
  zeroHash,
  type Address,
} from "viem";
import { getStorageAt } from "viem/actions";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { loadName } from "../../../internal/name/load.js";
import { requireAddress, singleStepPlan } from "../../../internal/name/write.js";
import { requirePermissionedResolver } from "../../../internal/resolver/permissioned.js";
import * as Rpc from "../../../internal/rpc/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { upgrade as Promises } from "./index.js";

// ERC-1967 implementation slot: bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1).
const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

const currentImplementation = (client: Client, proxy: Address): Effect.Effect<Address, AnyError> =>
  Rpc.fromPromise(
    () => getStorageAt(client.publicClient, { address: proxy, slot: implementationSlot }),
    {
      contract: proxy,
    },
  ).pipe(Effect.map((word) => getAddress(sliceHex(word ?? zeroHash, 12))));

/** @internal Builds the plan of `Actions.resolver.upgrade`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const latest = client.deployment.v2?.implementations.permissionedResolver;
  const target =
    options.implementation === undefined
      ? latest
      : yield* requireAddress(options.implementation, "implementation");
  if (target === undefined) {
    return yield* Effect.fail(
      new UnsupportedError({ code: "UNSUPPORTED_ON_DEPLOYMENT", feature: "PermissionedResolver" }),
    );
  }

  const resolver = yield* requirePermissionedResolver(
    client,
    yield* loadName(client, options.name),
    "upgrades",
  );

  const current = yield* currentImplementation(client, resolver);
  if (isAddressEqual(current, target)) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_RECORD_VALUE",
        field: "implementation",
        input: target,
        shortMessage: "The resolver already uses this implementation.",
      }),
    );
  }
  // The proxy only checks ROLE_UPGRADE; the target declaring itself compatible is checked here.
  const approved = yield* Rpc.readContractOrUndefined(client, {
    address: target,
    abi: Abis.v2.permissionedResolver,
    functionName: "canUpgradeFrom",
    args: [current],
  }).pipe(
    // A target without code is not an implementation either.
    Effect.catchIf(
      (error: AnyError) => error._tag === "ConfigError" && error.code === "CONTRACT_NOT_DEPLOYED",
      () => Effect.undefined,
    ),
  );
  if (approved !== true) {
    return yield* Effect.fail(new UnsupportedError({ code: "UPGRADE_NOT_APPROVED" }));
  }

  return singleStepPlan(client, {
    operation: "resolver.upgrade",
    account: options.account,
    description: "Upgrade resolver",
    calls: [
      {
        to: resolver,
        data: encodeFunctionData({
          abi: Abis.v2.permissionedResolver,
          functionName: "upgradeToAndCall",
          args: [target, "0x"],
        }),
        value: 0n,
      },
    ],
  });
});

const write = Action.write("resolver.upgrade", plan, { contractKind: "resolver" });

/** @internal Implementation of `Actions.resolver.upgrade`. */
export const upgrade = write.send;

/** @internal Implementation of `Actions.resolver.upgradeSync`. */
export const upgradeSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.resolver.upgrade`. */
export const upgradeMethods = write.methods;
