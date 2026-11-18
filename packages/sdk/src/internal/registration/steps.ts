import { Effect, Array as Arr } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData } from "viem";

import { CommitmentError } from "../../errors/classes/CommitmentError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import type { PreparedName, PreparedRegistration } from "./prepare.js";

/**
 * Which names still need a commitment. Commitments already made must be ready (older than the
 * minimum age) and not expired, or the registration fails with `CommitmentError`.
 */
export const pendingCommitments = (
  registration: PreparedRegistration,
): Effect.Effect<readonly PreparedName[], AnyError> => {
  for (const name of registration.names) {
    if (name.committedAt === 0n) continue;
    const readyAt = name.committedAt + registration.minCommitmentAge;
    const expiresAt = name.committedAt + registration.maxCommitmentAge;
    if (registration.now < readyAt) {
      return Effect.fail(
        new CommitmentError({ code: "COMMITMENT_TOO_NEW", commitment: name.commitment, readyAt }),
      );
    }
    if (registration.now >= expiresAt) {
      return Effect.fail(
        new CommitmentError({ code: "COMMITMENT_TOO_OLD", commitment: name.commitment, expiresAt }),
      );
    }
  }
  return Effect.succeed(Arr.filter(registration.names, (name) => name.committedAt === 0n));
};

/** The `commit` call of one name. */
export const commitCall = (registration: PreparedRegistration, name: PreparedName): Plan.Call => ({
  to: registration.contracts.registrar,
  data: encodeFunctionData({
    abi: Abis.v2.ethRegistrar,
    functionName: "commit",
    args: [name.commitment],
  }),
  value: 0n,
});

/** The `register` call of one name. */
export const registerCall = (
  registration: PreparedRegistration,
  name: PreparedName,
): Plan.Call => ({
  to: registration.contracts.registrar,
  data: encodeFunctionData({
    abi: Abis.v2.ethRegistrar,
    functionName: "register",
    args: [
      name.label,
      registration.owner,
      registration.secret,
      registration.subregistry,
      name.resolver,
      registration.duration,
      registration.token,
      registration.referrer,
    ],
  }),
  value: 0n,
});
