import { Effect } from "effect";

import type { Deployments } from "@ensforge/contracts";
import { getAddress, isAddress, type Account, type Address } from "viem";

import type { Client } from "../../client/types.js";
import { InvalidInputError } from "../../errors/classes/InvalidInputError.js";
import { NameStateError } from "../../errors/classes/NameStateError.js";
import { UnsupportedError } from "../../errors/classes/UnsupportedError.js";
import type { AnyError } from "../../errors/types.js";
import { make as makePlan } from "../../plan/make.js";
import type { Plan } from "../../plan/Plan.js";
import { addressOf } from "../address.js";
import type { LoadedName } from "./load.js";

/**
 * Fails unless the name is registered (not available, expired, in grace or reserved) and ENSv2
 * resolution still reaches it.
 */
export const requireRegistered = ({ state }: LoadedName): Effect.Effect<void, AnyError> => {
  switch (state.status) {
    case "registered":
      return state.reachable
        ? Effect.void
        : Effect.fail(new NameStateError({ code: "NAME_UNREACHABLE" }));
    case "grace":
    case "expired":
      return Effect.fail(new NameStateError({ code: "NAME_EXPIRED" }));
    case "reserved":
      return Effect.fail(new NameStateError({ code: "NAME_RESERVED" }));
    case "available":
      return Effect.fail(new NameStateError({ code: "NAME_NOT_REGISTERED" }));
  }
};

/** Fails with `UNSUPPORTED_PROTOCOL` for names on the other protocol. */
export const requireProtocol = (
  { state }: LoadedName,
  protocol: "v1" | "v2",
  feature: string,
): Effect.Effect<void, AnyError> =>
  state.protocol === protocol
    ? Effect.void
    : Effect.fail(
        new UnsupportedError({ code: "UNSUPPORTED_PROTOCOL", protocol: state.protocol, feature }),
      );

/**
 * Validates an address option. Mixed-case addresses must match their checksum, which catches
 * typos before a name or record goes to the wrong account.
 *
 * @stability unstable
 */
export const requireAddress = (value: string, field: string): Effect.Effect<Address, AnyError> =>
  isAddress(value)
    ? Effect.succeed(getAddress(value))
    : Effect.fail(
        new InvalidInputError({
          code: "INVALID_ADDRESS",
          input: value,
          field,
          hint: "Use a 0x-prefixed 20-byte address, all lowercase or with a correct checksum.",
        }),
      );

/** Builds a one-step plan for a name write. */
export const singleStepPlan = (
  client: Client,
  options: {
    readonly operation: string;
    readonly account: Account | Address | undefined;
    readonly description: string;
    readonly calls: readonly Plan.Call[];
  },
): Plan =>
  makePlan({
    operation: options.operation,
    chainId: client.chain.id,
    account: addressOf(options.account) ?? client.account,
    steps: [{ id: "write", description: options.description, calls: options.calls }],
  });

/** ENSv1 contracts of the deployment; fails on ENSv2-only deployments. */
export const requireV1Contracts = (
  client: Client,
): Effect.Effect<Deployments.V1Contracts, AnyError> => {
  const contracts = client.deployment.v1?.contracts;
  return contracts === undefined
    ? Effect.fail(new UnsupportedError({ code: "UNSUPPORTED_ON_DEPLOYMENT", feature: "ENSv1" }))
    : Effect.succeed(contracts);
};
