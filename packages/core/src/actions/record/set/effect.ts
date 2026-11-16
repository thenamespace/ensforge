import { Effect } from "effect";

import { multicallResolverAbi } from "@ensforge/contracts/shared";
import { encodeFunctionData, type Address, type Hex } from "viem";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { NotFoundError } from "../../../errors/classes/NotFoundError.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { loadName, type LoadedName } from "../../../internal/name/load.js";
import { setResolverCall } from "../../../internal/name/set-resolver.js";
import {
  requireAddress,
  requireRegistered,
  requireV1Contracts,
} from "../../../internal/name/write.js";
import { resolverKind } from "../../../internal/records/resolver-kind.js";
import { encodeRecordWrites } from "../../../internal/records/write-profiles.js";
import { addressOf } from "../../../internal/write/signer.js";
import { make as makePlan } from "../../../plan/make.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { set as Promises } from "./index.js";

/**
 * The resolver `options.resolver` asks for. `"default"` is the ENSv1 public resolver: the ENSv2
 * PublicResolverV2 only authorizes names known to the NameWrapper, and ENSv2 names otherwise get
 * a PermissionedResolver of their own.
 */
const requestedResolver = (
  client: Client,
  { state }: LoadedName,
  resolver: Address | "default",
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

  const kind = yield* resolverKind(client, resolver);
  const calls = yield* Effect.try({
    try: () => encodeRecordWrites(kind, loaded.data.parts, options),
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
