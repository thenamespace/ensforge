import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, isAddressEqual } from "viem";

import type { Client } from "../../../client/types.js";
import { ConfigError } from "../../../errors/classes/ConfigError.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { UnauthorizedError } from "../../../errors/classes/UnauthorizedError.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { requireAddress, singleStepPlan } from "../../../internal/name/write.js";
import { inspectRegistry } from "../../../internal/registry/inspect.js";
import { requireTargetRegistry } from "../../../internal/registry/target.js";
import { addressOf } from "../../../internal/write/signer.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { upgrade as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.registry.upgrade`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const signer = addressOf(options.account) ?? client.account;
  if (signer === undefined) {
    return yield* Effect.fail(new ConfigError({ code: "WALLET_NOT_CONFIGURED" }));
  }

  const registry = yield* requireTargetRegistry(client, options);
  const info = yield* inspectRegistry(client, registry, { account: signer });
  const target =
    options.implementation === undefined
      ? info.upgrade.latest
      : yield* requireAddress(options.implementation, "implementation");

  // A custom target is checked by the registry itself during the upgrade; the latest one is
  // checked here so the reason is clear before signing.
  const blocker =
    target === null || info.implementation === null
      ? "not-upgradeable"
      : options.implementation === undefined
        ? info.upgrade.blocker
        : isAddressEqual(target, info.implementation)
          ? "up-to-date"
          : info.upgrade.blocker === "unauthorized"
            ? "unauthorized"
            : null;
  switch (blocker) {
    case "up-to-date":
      return yield* Effect.fail(
        new InvalidInputError({
          code: "INVALID_RECORD_VALUE",
          field: "implementation",
          input: target,
          shortMessage: "The registry already runs this implementation.",
        }),
      );
    case "not-approved":
      return yield* Effect.fail(new UnsupportedError({ code: "UPGRADE_NOT_APPROVED" }));
    case "not-upgradeable":
      return yield* Effect.fail(
        new UnsupportedError({
          code: "UPGRADE_NOT_APPROVED",
          shortMessage: "This registry has no known upgrade target.",
          hint: "Pass `implementation` to choose one.",
        }),
      );
    case "unauthorized":
      return yield* Effect.fail(
        new UnauthorizedError({
          code: "MISSING_ROLES",
          account: signer,
          missingRoles: ["upgrade"],
        }),
      );
    case null:
      break;
  }

  return singleStepPlan(client, {
    operation: "registry.upgrade",
    account: options.account,
    description: "Upgrade registry",
    calls: [
      {
        to: registry,
        data: encodeFunctionData({
          abi: Abis.v2.userRegistry,
          functionName: "upgradeToAndCall",
          args: [target as `0x${string}`, "0x"],
        }),
        value: 0n,
      },
    ],
  });
});

const write = Action.write("registry.upgrade", plan, { contractKind: "registry" });

/** @internal Implementation of `Actions.registry.upgrade`. */
export const upgrade = write.send;

/** @internal Implementation of `Actions.registry.upgradeSync`. */
export const upgradeSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.registry.upgrade`. */
export const upgradeMethods = write.methods;
