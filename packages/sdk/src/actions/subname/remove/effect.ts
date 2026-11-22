import { Effect, Array as Arr, Option } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, hexToBigInt, type Address } from "viem";

import type { Client } from "../../../client/types.js";
import { ConfigError } from "../../../errors/classes/ConfigError.js";
import { NameStateError } from "../../../errors/classes/NameStateError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { addressOf } from "../../../internal/address.js";
import { callIndexer } from "../../../internal/indexer/call.js";
import { notRegistered, singleStepPlan } from "../../../internal/name/write.js";
import { explainRemoval } from "../../../internal/permission/subname.js";
import { loadSubname, type LoadedSubname } from "../../../internal/subname/load.js";
import { removeRoute } from "../../../internal/subname/v1-route.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { remove as Promises } from "./index.js";

/** ENSv2 unregisters the child, which also clears its resolver and subregistry. */
const v2RemoveCall = ({ child }: LoadedSubname): Plan.Call => ({
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a v2 or wrapped name's state always carries this field; `Name.State` types it as nullable for every protocol
  to: child.state.registry as Address,
  data: encodeFunctionData({
    abi: Abis.v2.permissionedRegistry,
    functionName: "unregister",
    args: [hexToBigInt(child.data.parts.labelhash)],
  }),
  value: 0n,
});

/**
 * Fails when the indexer knows subnames of the ENSv1 child, expired ones included: removing the
 * child leaves them in the registry, where they keep resolving. Without an indexer, or when it
 * cannot answer, it warns instead.
 */
const orphansCheck = Effect.fnUntraced(function* (
  client: Client,
  { child }: LoadedSubname,
): Effect.fn.Return<readonly Plan.Warning[], AnyError> {
  const unchecked: Plan.Warning = {
    code: "SUBNAMES_UNCHECKED",
    message: `Without an indexer, subnames of ${child.data.parts.name} cannot be found; removing it leaves them resolving.`,
  };
  if (client.config.indexer === undefined) return [unchecked];
  const page = yield* callIndexer(client, "getSubnames", {
    name: child.data.parts.name,
    namespace: "ens",
    includeExpired: true,
    limit: 20,
  }).pipe(
    Effect.asSome,
    Effect.catchTag("NotFoundError", () => Effect.succeedSome(null)),
    Effect.orElseSucceed(() => Option.none()),
  );
  if (Option.isNone(page)) return [unchecked];
  // Released and unregistered children no longer resolve.
  const live = Arr.filter(
    page.value?.items ?? [],
    (item) => item.status === "active" || item.status === "expired" || item.status === null,
  );
  if (live.length === 0) return [];
  return yield* Effect.fail(
    new NameStateError({
      code: "NAME_HAS_SUBNAMES",
      shortMessage: `${child.data.parts.name} has subnames (${Arr.join(
        Arr.map(live, (item) => item.name),
        ", ",
      )}), which would keep resolving without it.`,
    }),
  );
});

/** @internal Builds the plan of `Actions.subname.remove`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const signer = addressOf(options.account) ?? client.account;
  if (signer === undefined) {
    return yield* Effect.fail(new ConfigError({ code: "WALLET_NOT_CONFIGURED" }));
  }

  const subname = yield* loadSubname(client, options.name);
  if (subname.route === "l2") {
    if (subname.childState.status !== "registered") {
      return yield* Effect.fail(
        new NameStateError({
          code: "NAME_NOT_REGISTERED",
          shortMessage: `${subname.child.data.parts.name} does not exist.`,
          context: { chainId: subname.target.location.chainId },
        }),
      );
    }
    const { removeCall: l2RemoveCall } = yield* Effect.promise(
      () => import("../../../internal/namespace/l2/index.js"),
    );
    return singleStepPlan(subname.target.client, {
      operation: "subname.remove",
      account: options.account,
      description: "Remove subname",
      calls: [yield* l2RemoveCall(subname, signer)],
    });
  }
  if (subname.child.state.status === "available") {
    return yield* notRegistered(
      client,
      subname.child,
      `${subname.child.data.parts.name} does not exist.`,
    );
  }

  if (subname.child.state.protocol === "v2") {
    return singleStepPlan(client, {
      operation: "subname.remove",
      account: options.account,
      description: "Remove subname",
      calls: [v2RemoveCall(subname)],
    });
  }
  const children =
    options.allowOrphanedSubnames === true ? [] : yield* orphansCheck(client, subname);
  const route = yield* removeRoute(client, subname, signer);
  return singleStepPlan(client, {
    operation: "subname.remove",
    account: options.account,
    description: "Remove subname",
    calls: route.calls,
    warnings: [...children, ...route.warnings],
  });
});

const write = Action.write("subname.remove", plan, { contractKind: "registry" }, explainRemoval);

/** @internal Implementation of `Actions.subname.remove`. */
export const remove = write.send;

/** @internal Implementation of `Actions.subname.removeSync`. */
export const removeSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.subname.remove`. */
export const removeMethods = write.methods;
