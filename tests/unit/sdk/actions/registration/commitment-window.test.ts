import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import * as Ensforge from "@ensforge/sdk/internal/client/Ensforge";
import type { PreparedRegistration } from "@ensforge/sdk/internal/internal/registration/prepare";
import { pendingCommitments } from "@ensforge/sdk/internal/internal/registration/steps";
import { scriptedTransport } from "@ensforge/test-harness";
import { contractScript } from "@ensforge/test-harness/contracts-eth-call";
import { createPublicClient, keccak256, multicall3Abi, toHex } from "viem";
import { mainnet } from "viem/chains";

// ETHRegistrar accepts a commitment while `committedAt + minAge <= now < committedAt + maxAge`;
// the status read and the check before registering must agree with it at every boundary.
const committedAt = 1_800_000_000n;
const minAge = 60n;
const maxAge = 86_400n;
const commitment = keccak256(toHex("commitment"));

describe("registration.getCommitmentStatus", () => {
  it.effect("follows the registrar's window at its boundaries", () =>
    Effect.gen(function* () {
      const statuses = yield* Effect.forEach([minAge - 1n, minAge, maxAge - 1n, maxAge], (age) => {
        const { transport } = scriptedTransport(
          contractScript({
            contracts: [
              {
                address: Deployments.mainnet.v2.contracts.ethRegistrar,
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
                functions: { getCurrentBlockTimestamp: () => committedAt + age },
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
      });

      assert.deepStrictEqual(statuses, ["pending", "ready", "ready", "expired"]);
    }),
  );
});

describe("registration.register.prepare", () => {
  it.effect("rejects a commitment from the moment the registrar does", () =>
    Effect.gen(function* () {
      const codes = yield* Effect.forEach([maxAge - 1n, maxAge], (age) =>
        // Only the fields the commitment check reads.
        pendingCommitments({
          names: [{ committedAt, commitment }],
          minCommitmentAge: minAge,
          maxCommitmentAge: maxAge,
          now: committedAt + age,
        } as unknown as PreparedRegistration).pipe(
          Effect.match({ onSuccess: () => "usable", onFailure: (error) => error.code }),
        ),
      );

      assert.deepStrictEqual(codes, ["usable", "COMMITMENT_TOO_OLD"]);
    }),
  );
});
