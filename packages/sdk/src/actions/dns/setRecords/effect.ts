import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, isHex, type Hex } from "viem";

import type { Client } from "../../../client/types.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { NotFoundError } from "../../../errors/classes/NotFoundError.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import { lowercaseOwnerNames } from "../../../internal/dns/wire.js";
import { loadName } from "../../../internal/name/load.js";
import { requireRegistered, singleStepPlan } from "../../../internal/name/write.js";
import { explainFor } from "../../../internal/permission/check.js";
import { resolverCall } from "../../../internal/records/write-profiles.js";
import { describeResolver } from "../../../internal/resolver/describe.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { setRecords as Promises } from "./index.js";

/** @internal Builds the plan of `Actions.dns.setRecords`. */
export const plan = Effect.fnUntraced(function* (
  client: Client,
  options: Promises.Options & Pick<Write.Options, "account">,
): Effect.fn.Return<Plan, AnyError> {
  const { records, zonehash } = options;
  if (records !== undefined && !isHex(records)) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_RECORD_VALUE",
        field: "records",
        input: records,
        shortMessage: "`records` must be hex bytes.",
      }),
    );
  }
  if (zonehash !== undefined && zonehash !== null && !isHex(zonehash)) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_RECORD_VALUE",
        field: "zonehash",
        input: zonehash,
        shortMessage: "`zonehash` must be hex bytes.",
      }),
    );
  }
  if (records === undefined && zonehash === undefined) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_RECORD_VALUE",
        field: "records",
        shortMessage: "Nothing to write: pass `records` or `zonehash`.",
      }),
    );
  }

  // Owner names in their canonical lowercase form, as `dns.getRecords` reads them.
  const canonical =
    records === undefined
      ? undefined
      : yield* Effect.try({
          try: () => lowercaseOwnerNames(records),
          catch: (cause) =>
            new InvalidInputError({
              code: "INVALID_RECORD_VALUE",
              field: "records",
              input: records,
              shortMessage: "`records` must be resource records in DNS wire format.",
              cause,
            }),
        });

  const loaded = yield* loadName(client, options.name);
  yield* requireRegistered(loaded);
  const { resolver } = loaded.state;
  if (resolver === null)
    return yield* Effect.fail(new NotFoundError({ code: "RESOLVER_NOT_FOUND" }));

  const { node } = loaded.data.parts;
  const { kind } = yield* describeResolver(client, resolver, node);
  if (kind !== "public-resolver" && kind !== "public-resolver-v2") {
    return yield* Effect.fail(
      new UnsupportedError({
        code: "RESOLVER_PROFILE_UNSUPPORTED",
        feature: "DNS records",
        hint: "Only the ENS public resolvers store DNS records.",
      }),
    );
  }

  const calls: Hex[] = [];
  if (canonical !== undefined) {
    calls.push(
      encodeFunctionData({
        abi: Abis.v1.publicResolver,
        functionName: "setDNSRecords",
        args: [node, canonical],
      }),
    );
  }
  if (zonehash !== undefined) {
    calls.push(
      encodeFunctionData({
        abi: Abis.v1.publicResolver,
        functionName: "setZonehash",
        args: [node, zonehash ?? "0x"],
      }),
    );
  }

  return singleStepPlan(client, {
    operation: "dns.setRecords",
    account: options.account,
    description: "Set DNS records",
    calls: [resolverCall(resolver, calls)],
  });
});

const write = Action.write(
  "dns.setRecords",
  plan,
  { contractKind: "resolver" },
  // Public resolvers authorize every record the same way, so a text record stands in for them.
  explainFor(
    (options) => options.name,
    () => [{ setRecord: "text" as const }],
  ),
);

/** @internal Implementation of `Actions.dns.setRecords`. */
export const setRecords = write.send;

/** @internal Implementation of `Actions.dns.setRecordsSync`. */
export const setRecordsSync = write.sendSync;

/** @internal `.prepare`, `.simulate` and `.estimateGas` of `Actions.dns.setRecords`. */
export const setRecordsMethods = write.methods;
