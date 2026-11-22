import { Array as Arr } from "effect";

import { Abis } from "@ensforge/contracts";
import { encodeFunctionData } from "viem";

import type { Plan } from "../../plan/Plan.js";
import type { PreparedName, PreparedRegistration } from "./prepare.js";

/**
 * Which names still need a commitment, and when the ones already made are ready. A commitment
 * younger than the minimum age is waited for; an expired one is made again (the registrar only
 * refuses committing again while it is unexpired), with a warning.
 */
export const pendingCommitments = (
  registration: PreparedRegistration,
): {
  readonly toCommit: readonly PreparedName[];
  /** The latest time a commitment kept from before was made; registering waits for its age. */
  readonly committedAt: bigint | undefined;
  readonly warnings: readonly Plan.Warning[];
} => {
  const expired = (name: PreparedName) =>
    name.committedAt !== 0n && registration.now >= name.committedAt + registration.maxCommitmentAge;
  const kept = Arr.filter(registration.names, (name) => name.committedAt !== 0n && !expired(name));
  const unready = Arr.filter(
    kept,
    (name) => registration.now < name.committedAt + registration.minCommitmentAge,
  );
  return {
    toCommit: Arr.filter(registration.names, (name) => name.committedAt === 0n || expired(name)),
    committedAt:
      unready.length === 0
        ? undefined
        : Arr.reduce(unready, 0n, (latest, name) =>
            name.committedAt > latest ? name.committedAt : latest,
          ),
    warnings: Arr.map(Arr.filter(registration.names, expired), (name) => ({
      code: "COMMITMENT_RECOMMITTED",
      message: `The earlier commitment for ${name.name} expired; it is made again, and registering waits again.`,
    })),
  };
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
