import { Effect } from "effect";

import { hexToBigInt, isAddressEqual, zeroAddress, type Address } from "viem";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { loadName } from "../../../internal/name/load.js";
import {
  requireAddress,
  requireProtocol,
  requireRegistered,
  singleStepPlan,
} from "../../../internal/name/write.js";
import {
  attachCalls,
  parentLabel,
  requireNoSubregistry,
} from "../../../internal/registry/deploy.js";
import { inspectRegistry } from "../../../internal/registry/inspect.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { attach as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.registry.attach`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const loaded = yield* loadName(client, options.name);
  yield* requireRegistered(client, loaded);
  yield* requireProtocol(loaded, "v2", "subregistries");
  const registry =
    options.registry === null ? zeroAddress : yield* requireAddress(options.registry, "registry");
  if (options.registry !== null) yield* requireNoSubregistry(loaded, registry, options.replace);

  // A registry pasted in by the caller must be one: a top-level or unknown contract never is.
  const warnings: Plan.Warning[] = [];
  if (options.registry !== null) {
    const info = yield* inspectRegistry(client, registry);
    if (info.kind === "unknown" || info.kind === "root" || info.kind === "eth") {
      return yield* Effect.fail(
        new InvalidInputError({
          code: "INVALID_ADDRESS",
          field: "registry",
          input: registry,
          shortMessage:
            info.kind === "unknown"
              ? `${registry} is not an ENSv2 registry.`
              : `${registry} is the ${info.kind === "root" ? "root" : ".eth"} registry, which never sits under a name.`,
        }),
      );
    }
    if (
      info.upgrade.latest !== null &&
      info.implementation !== null &&
      !isAddressEqual(info.upgrade.latest, info.implementation)
    ) {
      warnings.push({
        code: "REGISTRY_UPGRADE_AVAILABLE",
        message: `${registry} runs an older registry implementation; registry.upgrade moves it to the latest.`,
      });
    }
  }
  const parent = yield* parentLabel(client, loaded.data.parts);

  const built = singleStepPlan(client, {
    operation: "registry.attach",
    account: options.account,
    description: options.registry === null ? "Detach registry" : "Attach registry",
    calls: attachCalls({
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a v2 or wrapped name's state always carries this field; `Name.State` types it as nullable for every protocol
      parentRegistry: loaded.state.registry as Address,
      tokenId: loaded.state.tokenId ?? hexToBigInt(loaded.data.parts.labelhash),
      label: parent.label,
      registry,
      detach: options.registry === null || options.setParent === false,
    }),
  });
  return {
    ...built,
    warnings: [...warnings, ...(options.registry === null ? [] : parent.warnings)],
  };
});

const write = Action.write("registry.attach", plan, { contractKind: "registry" });

/** @internal Implementation of `Actions.registry.attach`. */
export const attach = write.send;

/** @internal Implementation of `Actions.registry.attachSync`. */
export const attachSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.registry.attach`. */
export const attachMethods = write.methods;
