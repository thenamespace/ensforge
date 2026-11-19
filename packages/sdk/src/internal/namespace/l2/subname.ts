import { Effect } from "effect";

import { isAddressEqual, zeroAddress, type Address } from "viem";

import type { create } from "../../../actions/subname/create/index.js";
import type { update } from "../../../actions/subname/update/index.js";
import { InvalidInputError } from "../../../errors/classes/InvalidInputError.js";
import { NameStateError } from "../../../errors/classes/NameStateError.js";
import { NotFoundError } from "../../../errors/classes/NotFoundError.js";
import { UnsupportedError } from "../../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../../errors/types.js";
import type { Plan } from "../../../plan/Plan.js";
import * as V1Calls from "../../name/v1-calls.js";
import { requireAddress } from "../../name/write.js";
import { recordsCall } from "../../records/write-call.js";
import type { L2Subname } from "../../subname/load.js";
import { forkControl, forkResolver, forkTarget, type ForkContracts } from "./fork.js";

/** NameWrapper and ENSv2 options that L2 subnames do not take. */
const unsupportedOption = (option: string) =>
  new UnsupportedError({
    code: "UNSUPPORTED_ON_DEPLOYMENT",
    feature: `\`${option}\` on L2 subnames`,
    shortMessage: `ensforge does not set \`${option}\` on subnames of L2 names.`,
  });

/** The child's registry record as its parent writes it: in the registry, or the NameWrapper. */
const childRecord = (
  { child, parent, label, childState }: L2Subname,
  owner: Address,
  resolver: Address,
) => ({
  parentNode: parent.data.parts.node,
  label,
  labelhash: child.data.parts.labelhash,
  owner,
  resolver,
  ttl: childState.ttl ?? 0n,
});

const wrappedBy = (contracts: ForkContracts, to: Address): boolean =>
  contracts.nameWrapper !== undefined && isAddressEqual(to, contracts.nameWrapper);

/**
 * Calls that create (or with `upsert`, update) a child of a Basenames or Linea name, from the
 * parent. The child gets the family's current resolver by default. Records go to its resolver
 * while the signer owns it, then the child goes to `owner`: a resolver lets only the owner write.
 */
export const createCalls: (
  subname: L2Subname,
  options: create.Options,
  signer: Address,
) => Effect.Effect<readonly Plan.Call[], AnyError> = Effect.fnUntraced(function* (
  subname: L2Subname,
  options: create.Options,
  signer: Address,
): Effect.fn.Return<readonly Plan.Call[], AnyError> {
  const { target, child, childState } = subname;
  const fork = yield* forkTarget(target, subname.parent.data.parts);
  for (const option of ["fuses", "expiry", "roles", "emancipate"] as const) {
    if (options[option] !== undefined) return yield* Effect.fail(unsupportedOption(option));
  }
  if (childState.status === "registered" && options.upsert !== true) {
    return yield* Effect.fail(
      new NameStateError({
        code: "NAME_NOT_AVAILABLE",
        shortMessage: `${child.data.parts.name} already exists.`,
        hint: "Pass `upsert: true` to update it.",
      }),
    );
  }
  if (options.resolver === null && options.records !== undefined) {
    return yield* Effect.fail(
      new InvalidInputError({
        code: "INVALID_RECORD_VALUE",
        field: "records",
        input: null,
        shortMessage: "Records need a resolver.",
      }),
    );
  }

  const owner =
    options.owner === undefined ? signer : yield* requireAddress(options.owner, "owner");
  let requested: string | null;
  if (options.resolver === "parent") {
    requested = target.state.resolver;
    if (requested === null) {
      return yield* Effect.fail(new NotFoundError({ code: "RESOLVER_NOT_FOUND" }));
    }
  } else {
    // Upserts keep the child's resolver.
    requested =
      options.resolver === undefined
        ? options.upsert === true && childState.resolver !== null
          ? childState.resolver
          : "default"
        : options.resolver;
  }
  const resolver = yield* forkResolver(target.location, fork.contracts, requested);

  const wrapped = wrappedBy(fork.contracts, fork.to);
  const record = childRecord(subname, owner, resolver);
  if (options.records === undefined) return [V1Calls.setSubnodeRecord(fork.to, wrapped, record)];
  const records = yield* recordsCall(target.client, resolver, child.data.parts, options.records);
  return owner === signer
    ? [V1Calls.setSubnodeRecord(fork.to, wrapped, record), records]
    : [
        V1Calls.setSubnodeRecord(fork.to, wrapped, { ...record, owner: signer }),
        records,
        V1Calls.setSubnodeRecord(fork.to, wrapped, record),
      ];
});

/** The call that rewrites an existing child's owner or resolver from its Basenames or Linea parent. */
export const updateCall: (
  subname: L2Subname,
  options: update.Options,
) => Effect.Effect<Plan.Call, AnyError> = Effect.fnUntraced(function* (
  subname: L2Subname,
  options: update.Options,
): Effect.fn.Return<Plan.Call, AnyError> {
  const { target, childState } = subname;
  const fork = yield* forkTarget(target, subname.parent.data.parts);
  if (options.expiry !== undefined) return yield* Effect.fail(unsupportedOption("expiry"));
  const owner =
    options.owner === undefined
      ? (childState.owner ?? zeroAddress)
      : yield* requireAddress(options.owner, "owner");
  const resolver =
    options.resolver === undefined
      ? (childState.resolver ?? zeroAddress)
      : yield* forkResolver(target.location, fork.contracts, options.resolver);
  return V1Calls.setSubnodeRecord(
    fork.to,
    wrappedBy(fork.contracts, fork.to),
    childRecord(subname, owner, resolver),
  );
});

/**
 * The call that removes a child of a Basenames or Linea name: from the parent when the signer
 * controls it, otherwise as the child's own owner (`setRecord` to zero).
 */
export const removeCall: (
  subname: L2Subname,
  signer: Address,
) => Effect.Effect<Plan.Call, AnyError> = Effect.fnUntraced(function* (
  subname: L2Subname,
  signer: Address,
): Effect.fn.Return<Plan.Call, AnyError> {
  const { target, parent, child, childState } = subname;
  const fork = yield* forkTarget(target, parent.data.parts);
  const control = yield* forkControl(target.client, fork.contracts, parent.data.parts, signer);
  if (control.via !== null) {
    return V1Calls.setSubnodeRecord(
      fork.to,
      wrappedBy(fork.contracts, fork.to),
      childRecord(subname, zeroAddress, zeroAddress),
    );
  }
  const own =
    childState.wrapped && fork.contracts.nameWrapper !== undefined
      ? fork.contracts.nameWrapper
      : fork.contracts.registry;
  return V1Calls.clearRecord(own, child.data.parts.node);
});
