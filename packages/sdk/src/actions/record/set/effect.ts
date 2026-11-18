import { Effect } from "effect";

import { Abis, InterfaceIds } from "@ensforge/contracts";
import { isAddressEqual, type Address } from "viem";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { NotFoundError } from "../../../errors/classes/NotFoundError.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { addressOf } from "../../../internal/address.js";
import { loadName } from "../../../internal/name/load.js";
import { requestedResolver, setResolverCall } from "../../../internal/name/set-resolver.js";
import { requireRegistered } from "../../../internal/name/write.js";
import { explainFor } from "../../../internal/permission/check.js";
import { writeOperations } from "../../../internal/permission/records.js";
import { setterKeying } from "../../../internal/records/setter-keying.js";
import {
  encodeRecordWrites,
  recordWriteCodecs,
  resolverCall,
  writtenProfiles,
} from "../../../internal/records/write-profiles.js";
import { describeResolver } from "../../../internal/resolver/describe.js";
import * as Rpc from "../../../internal/rpc/index.js";
import { make as makePlan } from "../../../plan/make.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { set as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.record.set`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  // The registry holding the name knows its own resolver. The Universal Resolver would also
  // return wildcards and, for names still on ENSv1, the read-only ENSv1 bridge resolver.
  const loaded = yield* loadName(client, options.name);
  yield* requireRegistered(loaded);

  let resolver: Address;
  let resolverChange: Plan.Call | undefined;
  if (options.resolver === undefined) {
    const current = loaded.state.resolver;
    if (current === null) {
      return yield* Effect.fail(new NotFoundError({ code: "RESOLVER_NOT_FOUND" }));
    }
    const frozen = client.deployment.v1?.frozenPublicResolvers ?? [];
    if (frozen.some((address) => isAddressEqual(address, current))) {
      return yield* Effect.fail(
        new UnsupportedError({
          code: "RESOLVER_PROFILE_UNSUPPORTED",
          feature: "writing records",
          shortMessage:
            "The name's resolver is bound to the registry ENS replaced in 2020; its records cannot change.",
          hint: "Pass `resolver` to write the records to a new resolver and switch to it.",
        }),
      );
    }
    resolver = current;
  } else {
    resolver = yield* requestedResolver(client, loaded, options.resolver);
    resolverChange = yield* setResolverCall(client, loaded, resolver);
  }

  // One round: how the setters key the name, the profiles the resolver declares, and whether it
  // implements ERC-165 at all (within the gas EIP-165 allows `supportsInterface`).
  const { keying, resolverInfo, erc165 } = yield* Effect.all(
    {
      keying: setterKeying(client, resolver),
      resolverInfo: describeResolver(client, resolver, loaded.data.parts.node),
      erc165: Rpc.readContractOrUndefined(client, {
        address: resolver,
        abi: Abis.shared.erc165,
        functionName: "supportsInterface",
        args: [InterfaceIds.erc165],
        gas: 30_000n,
      }).pipe(Effect.orElseSucceed(() => undefined)),
    },
    { concurrency: "unbounded" },
  );
  if (resolverInfo.authorization === "none") {
    return yield* Effect.fail(
      new UnsupportedError({
        code: "RESOLVER_PROFILE_UNSUPPORTED",
        feature: "writing records",
        shortMessage: "The resolver does not store records that can be written.",
        hint: "Pass `resolver` to write the records to a resolver that stores them, and switch to it.",
      }),
    );
  }

  // A resolver without ERC-165 predates the profiles it would declare, except that it surely
  // lacks `data` (ENSIP-24, newer than all of them); its other writes are left to simulation.
  const missing = writtenProfiles(options).find(
    ([profile]) => (erc165 === true || profile === "data") && !resolverInfo.profiles[profile],
  )?.[1];
  // Node-keyed resolvers clear by bumping the record version; older ones have neither.
  const unsupported =
    missing ??
    (erc165 === true && options.clear === true && keying === "node" && resolverInfo.version === null
      ? "clearing records"
      : undefined);
  if (unsupported !== undefined) {
    return yield* Effect.fail(
      new UnsupportedError({
        code: "RESOLVER_PROFILE_UNSUPPORTED",
        feature: unsupported,
        shortMessage: `The resolver does not support ${unsupported}.`,
      }),
    );
  }

  const codecs = yield* recordWriteCodecs(options);
  const calls = yield* Effect.try({
    try: () => encodeRecordWrites(keying, loaded.data.parts, options, codecs),
    catch: (error) => error as AnyError,
  });

  // Records go to the new resolver before the name points at it, so a failed or rejected write
  // never leaves the name on an empty resolver. Neither resolver family authorizes record writes
  // through the name's resolver pointer, so both fit in one step.
  const stepCalls = [
    ...(calls.length > 0 ? [resolverCall(resolver, calls)] : []),
    ...(resolverChange === undefined ? [] : [resolverChange]),
  ];
  if (stepCalls.length === 0) {
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
    steps: [
      {
        id: "records",
        description:
          resolverChange === undefined
            ? "Set records"
            : calls.length > 0
              ? "Set records and resolver"
              : "Set resolver",
        calls: stepCalls,
      },
    ],
  });
});

const write = Action.write(
  "record.set",
  plan,
  { contractKind: "resolver" },
  explainFor(
    (options) => options.name,
    (options) => [
      ...writeOperations(options),
      ...(options.resolver === undefined ? [] : ["setResolver" as const]),
    ],
  ),
);

/** @internal Implementation of `Actions.record.set`. */
export const set = write.send;

/** @internal Implementation of `Actions.record.setSync`. */
export const setSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.record.set`. */
export const setMethods = write.methods;
