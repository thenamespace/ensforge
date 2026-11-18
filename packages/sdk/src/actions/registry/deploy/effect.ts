import { Effect } from "effect";

import { hexToBigInt, type Address } from "viem";

import type { Client } from "../../../client/types.js";
import { ConfigError } from "../../../errors/classes/ConfigError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { addressOf } from "../../../internal/address.js";
import { randomSalt } from "../../../internal/factory/verifiable-proxy.js";
import { loadName } from "../../../internal/name/load.js";
import {
  requireAddress,
  requireProtocol,
  requireRegistered,
} from "../../../internal/name/write.js";
import { attachCalls, deployUserRegistry } from "../../../internal/registry/deploy.js";
import { roleBitmapOf } from "../../../internal/role/bitmap.js";
import { make as makePlan } from "../../../plan/make.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { deploy as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.registry.deploy`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const signer = addressOf(options.account) ?? client.account;
  if (signer === undefined) {
    return yield* Effect.fail(new ConfigError({ code: "WALLET_NOT_CONFIGURED" }));
  }

  const owner =
    options.owner === undefined ? signer : yield* requireAddress(options.owner, "owner");
  const grants = yield* Effect.forEach(options.grants ?? [], (grant) =>
    Effect.gen(function* () {
      const account = yield* requireAddress(grant.account, "grants.account");
      const roleBitmap = yield* roleBitmapOf(grant.roles);
      return { account, roleBitmap };
    }),
  );
  const attachTo =
    options.attachTo === undefined ? undefined : yield* loadName(client, options.attachTo);
  if (attachTo !== undefined) {
    yield* requireRegistered(attachTo);
    yield* requireProtocol(attachTo, "v2", "subregistries");
  }

  // Attaching calls `setParent` on the new registry, so the signer needs root roles there too.
  const deployment = yield* deployUserRegistry(client, {
    deployer: signer,
    owners: attachTo === undefined ? [owner] : [owner, signer],
    emancipated: options.emancipated === true,
    salt: options.salt ?? randomSalt(),
    grants,
  });
  const steps: Plan.Step[] = [
    { id: "deploy", description: "Deploy registry", calls: [deployment.call] },
  ];
  if (attachTo !== undefined) {
    steps.push({
      id: "attach",
      description: "Attach registry",
      calls: attachCalls({
        parentRegistry: attachTo.state.registry as Address,
        tokenId: attachTo.state.tokenId ?? hexToBigInt(attachTo.data.parts.labelhash),
        label: attachTo.data.parts.label,
        registry: deployment.address,
        detach: false,
      }),
    });
  }

  return makePlan({
    operation: "registry.deploy",
    chainId: client.chain.id,
    account: signer,
    steps,
    deploys: [{ contract: "registry", address: deployment.address }],
  });
});

const write = Action.write("registry.deploy", plan, { contractKind: "registry" });

const withRegistry = <result extends Write.Result>(result: result) => ({
  ...result,
  registry: (result.plan.deploys[0] as Plan.Deployment).address,
});

/** @internal Implementation of `Actions.registry.deploy`. */
export const deploy = (
  client: Client,
  options: Promises.Options & Write.Options,
): Effect.Effect<Promises.ReturnType, AnyError> =>
  write.send(client, options).pipe(Effect.map(withRegistry));

/** @internal Implementation of `Actions.registry.deploySync`. */
export const deploySync = (
  client: Client,
  options: Promises.Options & Write.SyncOptions,
): Effect.Effect<Write.SyncResult & { readonly registry: Address }, AnyError> =>
  write.sendSync(client, options).pipe(Effect.map(withRegistry));

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.registry.deploy`. */
export const deployMethods = write.methods;
