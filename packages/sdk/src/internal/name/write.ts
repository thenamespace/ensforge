import { Effect } from "effect";
import { absurd } from "effect/Function";

import { Deployments } from "@ensforge/contracts";
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
import type { L2WriteTarget } from "./location.js";
import { servedName } from "./served.js";

/**
 * The failure for a name no registry holds: `NAME_EXTERNAL` when it lives on an L2 or a parent's
 * resolver serves it (naming the L2 or the off-chain provider when ensforge knows it), otherwise
 * `NAME_NOT_REGISTERED` with `shortMessage`.
 */
export const notRegistered = Effect.fnUntraced(function* (
  client: Client,
  loaded: LoadedName,
  shortMessage?: string,
): Effect.fn.Return<never, AnyError> {
  const { parts } = loaded.data;
  if (loaded.kind === "available") {
    const { l2Refusal } = yield* Effect.promise(() => import("./location.js"));
    const refusal = yield* l2Refusal(client, parts);
    if (refusal !== null) return yield* Effect.fail(refusal);
  }

  const served = yield* servedName(client, loaded);
  if (served === null) {
    return yield* Effect.fail(new NameStateError({ code: "NAME_NOT_REGISTERED", shortMessage }));
  }
  const provider =
    served.kind === "offchain"
      ? Deployments.offchainProvider({ chainId: client.chain.id, resolver: served.resolver })
      : undefined;
  return yield* Effect.fail(
    new NameStateError({
      code: "NAME_EXTERNAL",
      ...(provider === undefined
        ? {}
        : {
            shortMessage: `${parts.name} is served by ${provider.name} from its own database. ensforge can read it, not write it.`,
            hint: `Change it with ${provider.name}'s app or API.`,
          }),
      context: { name: parts.name, contract: served.resolver },
    }),
  );
});

/**
 * Where a write on a name no ENS registry holds goes: its L2 and its state there, failing when
 * the name is not registered there. `null` for names in ENS and names in no L2 namespace.
 */
export const l2WriteTargetOf = (
  client: Client,
  loaded: LoadedName,
): Effect.Effect<L2WriteTarget | null, AnyError> =>
  loaded.kind === "available"
    ? Effect.promise(() => import("./location.js")).pipe(
        Effect.flatMap(({ l2WriteTarget }) => l2WriteTarget(client, loaded.data.parts)),
      )
    : Effect.succeed(null);

/**
 * Fails unless the name is registered (not available, expired, in grace, reserved or managed
 * outside ENS's registries) and ENSv2 resolution still reaches it.
 */
export const requireRegistered = (
  client: Client,
  loaded: LoadedName,
): Effect.Effect<void, AnyError> => {
  const { state } = loaded;
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
    case "external":
      return Effect.fail(new NameStateError({ code: "NAME_EXTERNAL" }));
    case "available":
      return notRegistered(client, loaded);
    default:
      return absurd(state.status);
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
    readonly warnings?: readonly Plan.Warning[] | undefined;
  },
): Plan =>
  makePlan({
    operation: options.operation,
    chainId: client.chain.id,
    account: addressOf(options.account) ?? client.account,
    steps: [{ id: "write", description: options.description, calls: options.calls }],
    warnings: options.warnings,
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
