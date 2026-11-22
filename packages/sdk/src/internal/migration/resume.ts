import { Effect, Array as Arr, Record as Rec, String as Str } from "effect";

import { Abis } from "@ensforge/contracts";
import { isAddressEqual, type Address } from "viem";

import type { NameInput } from "../../actions/migration/types.js";
import type { Client } from "../../client/types.js";
import { MigrationError } from "../../errors/classes/MigrationError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import * as Fuse from "../../utils/Fuse.js";
import { loadName } from "../name/load.js";
import { recordsCall } from "../records/write-call.js";
import * as Rpc from "../rpc/index.js";
import { discoverSubnames } from "./discover.js";
import type { Inspection } from "./inspect.js";
import type { Expectation } from "./plan.js";
import { recordsToCopy, type CopiedRecords } from "./records.js";
import { planRecreation } from "./subnames.js";
import { isCertifiedWrapperRegistry } from "./wrapper-registry.js";

/** What is left to do for a name an interrupted migration already moved to ENSv2. */
export type Resumed = {
  /** Registrations of its direct subnames still on ENSv1, in its WrapperRegistry. */
  readonly wrapped: readonly Plan.Call[];
  /** The records still to write on PublicResolverV2. */
  readonly records: Plan.Call | undefined;
  /** Whether the sender still holds a PublicResolverV2 delegation on the name. */
  readonly delegated: boolean;
  readonly warnings: readonly Plan.Warning[];
  readonly expectation: Expectation;
};

/**
 * Plans what an interrupted migration left undone for a migrated name: only the steps that
 * follow the transfer, each checked against the chain so a second resume plans nothing. The
 * transfer clears the ENSv1 resolver and manager, so records and managers cannot be read back.
 */
export const planResumed = Effect.fnUntraced(function* (
  client: Client,
  options: {
    readonly input: NameInput;
    readonly inspection: Inspection;
    readonly signer: Address;
    readonly sender: Address;
    readonly allowLeavingSubnames: boolean;
    readonly allowEmptyResolver: boolean;
    readonly preserveManager: boolean;
  },
): Effect.fn.Return<Resumed, AnyError> {
  const { loaded } = options.inspection;
  const { state, data } = loaded;
  const { parts } = data;
  const config = typeof options.input === "string" ? undefined : options.input;
  const owner = state.owner;
  const expectation: Expectation = {
    name: state.name,
    owner: owner ?? options.signer,
    resolver: state.resolver,
    subregistry: state.subregistry,
    records: undefined,
    subnames: [],
  };
  const v2 = client.deployment.v2;
  // Every step after the transfer is the new owner's: for another owner there is nothing left.
  if (v2 === undefined || owner === null || !isAddressEqual(owner, options.signer)) {
    return { wrapped: [], records: undefined, delegated: false, warnings: [], expectation };
  }

  const warnings: Plan.Warning[] = [];
  if (config?.preserveManager ?? options.preserveManager) {
    warnings.push({
      code: "MANAGER_NOT_PRESERVED",
      message: `${state.name} is already on ENSv2, where its ENSv1 manager is no longer recorded; grant it roles with \`role.grant\` if it still needs them.`,
    });
  }

  // A locked name has the WrapperRegistry its migration created; anything else has nothing to
  // register after the transfer.
  const subregistry = state.subregistry;
  const locked =
    subregistry !== null && (yield* isCertifiedWrapperRegistry(client, state.name, subregistry));
  if (!locked) return { wrapped: [], records: undefined, delegated: false, warnings, expectation };

  // Direct subnames registered by the run that was interrupted are skipped, with everything
  // below them: those levels were created before the transfer.
  const suffix = `.${state.name}`;
  let subnames = config?.subnames;
  if (subnames === undefined) {
    const discovered = yield* discoverSubnames(client, state.name);
    subnames = discovered?.names;
  }
  const fullNames = Arr.map(subnames ?? [], (input) => {
    const lowered = Str.toLowerCase(input);
    return Str.endsWith(suffix)(lowered) ? lowered : `${lowered}${suffix}`;
  });
  const directOf = (name: string) => {
    const labels = Str.split(".")(Str.slice(0, -suffix.length)(name));
    return `${Arr.lastNonEmpty(labels)}${suffix}`;
  };
  const direct = [...new Set(Arr.map(fullNames, directOf))];
  const kinds = yield* Effect.forEach(direct, (name) => loadName(client, name), {
    concurrency: "unbounded",
  });
  const registered = new Set(
    Arr.filter(
      direct,
      (_, index) => kinds[index]?.kind !== "v1-wrapped" && kinds[index]?.kind !== "v1-unwrapped",
    ),
  );
  const remaining = Arr.filter(fullNames, (name) => !registered.has(directOf(name)));

  let wrapped: readonly Plan.Call[] = [];
  let recreated: Expectation["subnames"] = [];
  if (remaining.length > 0) {
    const recreation = yield* planRecreation(client, {
      parent: { name: state.name, label: parts.label, node: parts.node },
      subnames: remaining,
      owner,
      sender: options.sender,
      parentRegistry: data.v2?.registry ?? v2.contracts.ethRegistry,
      wrapperRegistry: { address: subregistry, fuses: data.v1?.wrapper.fuses ?? 0 },
    });
    if (recreation.leftBehind.length > 0 && !options.allowLeavingSubnames) {
      return yield* Effect.fail(
        new MigrationError({
          code: "NOT_ELIGIBLE",
          blockers: Arr.map(
            recreation.leftBehind,
            (child) => `subname ${child.name}: ${child.reason}`,
          ),
          context: { name: state.name },
          hint: "Pass `allowLeavingSubnames` to finish without them.",
        }),
      );
    }
    wrapped = recreation.wrapped;
    recreated = recreation.recreated;
    warnings.push(...recreation.warnings);
  }

  // A locked `cannotSetResolver` name got an empty PublicResolverV2, written after the transfer.
  const publicResolver = v2.contracts.publicResolver;
  const onPublicResolver =
    Fuse.has(data.v1?.wrapper.fuses ?? 0, "cannotSetResolver") &&
    state.resolver !== null &&
    isAddressEqual(state.resolver, publicResolver);
  if (!onPublicResolver) {
    return {
      wrapped,
      records: undefined,
      delegated: false,
      warnings,
      expectation: { ...expectation, subnames: recreated },
    };
  }

  const routed = !isAddressEqual(options.sender, options.signer);
  const delegated =
    routed &&
    (yield* Rpc.readContract(client, {
      address: publicResolver,
      abi: Abis.v2.publicResolver,
      functionName: "isApprovedFor",
      args: [owner, parts.node, options.sender],
    }));
  const copied: CopiedRecords | undefined = config?.records;
  if (copied === undefined) {
    // What PublicResolverV2 already serves: a copy that landed needs nothing more.
    const served = yield* recordsToCopy(client, undefined, state.name, {
      hasRecords: true,
      allowIncomplete: true,
    });
    const servedRecords: Readonly<Record<string, unknown>> = served.records ?? {};
    if (Rec.isEmptyRecord(servedRecords) && !options.allowEmptyResolver) {
      return yield* Effect.fail(
        new MigrationError({
          code: "RECORDS_UNKNOWN",
          shortMessage: `${state.name}'s records were not copied to PublicResolverV2, and the migration cleared its ENSv1 resolver.`,
          hint: "Pass the name's `records` to write them, or `allowEmptyResolver` to finish without them.",
        }),
      );
    }
  }
  const records =
    copied === undefined
      ? undefined
      : yield* recordsCall(client, publicResolver, parts, copied, "node");
  return {
    wrapped,
    records,
    delegated,
    warnings,
    expectation: { ...expectation, records: copied, subnames: recreated },
  };
});
