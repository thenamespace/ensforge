import { Effect } from "effect";

import { multicallResolverAbi } from "@ensforge/contracts/shared";
import { encodeFunctionData, type Address, type Hex } from "viem";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { NotFoundError } from "../../../errors/classes/NotFoundError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { loadName } from "../../../internal/name/load.js";
import { requestedResolver, setResolverCall } from "../../../internal/name/set-resolver.js";
import { requireRegistered } from "../../../internal/name/write.js";
import { setterKeying } from "../../../internal/records/setter-keying.js";
import { encodeRecordWrites } from "../../../internal/records/write-profiles.js";
import { addressOf } from "../../../internal/write/signer.js";
import { make as makePlan } from "../../../plan/make.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { set as Promises } from "./index.js";

/** One call on the resolver: the setter itself, or a `multicall` of several. */
const resolverCall = (resolver: Address, calls: readonly Hex[]): Plan.Call => ({
  to: resolver,
  data:
    calls.length === 1
      ? (calls[0] as Hex)
      : encodeFunctionData({ abi: multicallResolverAbi, functionName: "multicall", args: [calls] }),
  value: 0n,
});

/** @internal Builds the plan of `Actions.record.set`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  // The registry holding the name knows its own resolver. The Universal Resolver would also
  // return wildcards and, for names still on ENSv1, the read-only ENSv1 bridge resolver.
  const loaded = yield* loadName(client, options.name);
  yield* requireRegistered(loaded);

  const steps: Plan.Step[] = [];
  let resolver: Address;
  if (options.resolver === undefined) {
    if (loaded.state.resolver === null) {
      return yield* Effect.fail(new NotFoundError({ code: "RESOLVER_NOT_FOUND" }));
    }
    resolver = loaded.state.resolver;
  } else {
    resolver = yield* requestedResolver(client, loaded, options.resolver);
    steps.push({
      id: "resolver",
      description: "Set resolver",
      calls: [yield* setResolverCall(client, loaded, resolver)],
    });
  }

  const keying = yield* setterKeying(client, resolver);
  const calls = yield* Effect.try({
    try: () => encodeRecordWrites(keying, loaded.data.parts, options),
    catch: (error) => error as AnyError,
  });
  if (calls.length > 0) {
    steps.push({
      id: "records",
      description: "Set records",
      calls: [resolverCall(resolver, calls)],
    });
  }

  if (steps.length === 0) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_RECORD_VALUE",
        field: "records",
        input: options.name,
        shortMessage: "Nothing to write: no records, `clear` or `resolver` were given.",
      }),
    );
  }
  return makePlan({
    operation: "record.set",
    chainId: client.chain.id,
    account: addressOf(options.account) ?? client.account,
    steps,
  });
});

const write = Action.write("record.set", plan, { contractKind: "resolver" });

/** @internal Implementation of `Actions.record.set`. */
export const set = write.send;

/** @internal Implementation of `Actions.record.setSync`. */
export const setSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.record.set`. */
export const setMethods = write.methods;
