import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import { scriptedTransport } from "@ensforge/test-harness";
import { contractScript } from "@ensforge/test-harness/contracts-eth-call";
import { createPublicClient, keccak256, multicall3Abi, toHex } from "viem";
import { mainnet } from "viem/chains";

import * as Ensforge from "#/client/Ensforge";
import type { PreparedRegistration } from "#/internal/registration/prepare";
import { pendingCommitments } from "#/internal/registration/steps";

import { deployment } from "../world.js";

const committedAt = 1_800_000_000n;
const minAge = 60n;
const maxAge = 86_400n;
const commitment = keccak256(toHex("commitment"));

const statusAt = (timestamp: bigint) => {
  const { transport } = scriptedTransport(
    contractScript({
      contracts: [
        {
          address: deployment.v2.contracts.ethRegistrar,
          abi: Abis.v2.ethRegistrar,
          functions: {
            rentPriceOracle: () => "0x00000000000000000000000000000000000000fe",
            commitmentAt: () => committedAt,
            MIN_COMMITMENT_AGE: () => minAge,
            MAX_COMMITMENT_AGE: () => maxAge,
          },
        },
        {
          address: mainnet.contracts.multicall3.address,
          abi: multicall3Abi,
          functions: { getCurrentBlockTimestamp: () => timestamp },
        },
      ],
    }),
  );
  const ens = Ensforge.create({
    publicClient: createPublicClient({ chain: mainnet, transport }),
    batch: { multicall: false },
  });
  return Actions.registration
    .getCommitmentStatus(ens, { commitment })
    .pipe(Effect.map(({ status }) => status));
};

describe("registration.getCommitmentStatus", () => {
  // ETHRegistrar accepts a commitment while `readyAt <= now < expiresAt`.
  it.effect("follows the registrar's window at its boundaries", () =>
    Effect.gen(function* () {
      const statuses = yield* Effect.forEach([minAge - 1n, minAge, maxAge - 1n, maxAge], (age) =>
        statusAt(committedAt + age),
      );
      assert.deepStrictEqual(statuses, ["pending", "ready", "ready", "expired"]);
    }),
  );
});

// Only the fields the commitment check reads.
const preparedAt = (now: bigint) =>
  ({
    names: [{ committedAt, commitment }],
    minCommitmentAge: minAge,
    maxCommitmentAge: maxAge,
    now,
  }) as unknown as PreparedRegistration;

describe("registration.register.prepare", () => {
  it.effect("rejects a commitment from the moment the registrar does", () =>
    Effect.gen(function* () {
      const codes = yield* Effect.forEach([maxAge - 1n, maxAge], (age) =>
        pendingCommitments(preparedAt(committedAt + age)).pipe(
          Effect.match({ onSuccess: () => "usable", onFailure: (error) => error.code }),
        ),
      );
      assert.deepStrictEqual(codes, ["usable", "COMMITMENT_TOO_OLD"]);
    }),
  );
});
