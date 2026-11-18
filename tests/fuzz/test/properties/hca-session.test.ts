import { describe } from "@effect/vitest";
import { Arbitrary, Effect, Option, Schema, Array as Arr } from "effect";

import {
  hcaSessionApprovalDigest,
  hcaSessionDigest,
  hcaSessionPermissionId,
  hcaSessionSalt,
  hcaSessionTypedData,
  hcaSignedSession,
} from "@ensforge/contracts/v2/experimental/hca";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Arbitraries } from "@ensforge/test-harness";
import { onProfile } from "@ensforge/test-integration/support/lane";
import { concat, keccak256, numberToHex, parseAbi, zeroAddress, type Hex } from "viem";

import { holds } from "./check.ts";

// `tests/devnet/contracts/HCASessionHashes.sol`: the validator's internal session hashing.
const sessionHashesAbi = parseAbi([
  "struct SessionEnableProof { address sessionKey; uint48 validUntil; uint96 sessionNonce; address resolver; address refundToken; uint96 maxRefundExchangeRate; uint48 maxRefundGasOverhead; uint96 maxRefundAmount; uint8 sessionToEnableIndex; }",
  "struct HashAndChainId { uint64 chainId; bytes32 sessionDigest; }",
  "function sessionAuthorizationSalt(SessionEnableProof proof) pure returns (bytes32)",
  "function authorizationHashes(address account, address sessionKey, bytes32 salt) pure returns (bytes32 permissionId, bytes32 sessionDigest)",
  "function multiChainDigest(HashAndChainId[] sessions) pure returns (bytes32)",
  "function validateMultiChainAuthorization(address expectedOwner, bytes32 expectedSessionDigest, uint256 selectedIndex, bytes packedSessions, bytes ownerSignature) view returns (uint8)",
]);

/** One chain's entry in a session envelope: `bytes8 chainId ‖ bytes32 sessionDigest`. */
const entry = (chainId: number, digest: Hex) => concat([numberToHex(chainId, { size: 8 }), digest]);

/** Unsigned integers of the contract's field width, up to its maximum. */
const uint = (bits: number) =>
  Arbitrary.schema(
    Schema.BigInt.check(Schema.isBetweenBigInt({ minimum: 0n, maximum: 2n ** BigInt(bits) - 1n })),
  );

const session = Arbitrary.all({
  account: Arbitraries.address,
  sessionKey: Arbitraries.address,
  salt: Arbitraries.bytes32,
});

/** One to four chains, each with its own session; chain IDs are safe integers (uint64 on chain). */
const chainSessions = Arbitrary.array(
  Arbitrary.all({ chainId: Arbitraries.uint(Number.MAX_SAFE_INTEGER), session }),
  { minLength: 1, maxLength: 4 },
);

describe("HCA session approvals against the contracts", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect("the salt binds the terms as HCAOwnerAndSessionValidator hashes them", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const chain = yield* Chain;
        // Each term spans its full on-chain width, so a narrower or reordered field fails.
        const terms = Arbitrary.all({
          sessionNonce: uint(96),
          validUntil: Arbitrary.map(uint(48), Number),
          resolver: Arbitraries.address,
          refundToken: Arbitraries.address,
          maxRefundExchangeRate: uint(96),
          maxRefundGasOverhead: uint(48),
          maxRefundAmount: uint(96),
        });

        yield* holds(terms, (input) =>
          chain
            .read({
              address: devnet.contract("hca.sessionHashes"),
              abi: sessionHashesAbi,
              functionName: "sessionAuthorizationSalt",
              args: [
                {
                  ...input,
                  maxRefundGasOverhead: Number(input.maxRefundGasOverhead),
                  // Not part of the salt.
                  sessionKey: zeroAddress,
                  sessionToEnableIndex: 0,
                },
              ],
            })
            .pipe(Effect.map((salt) => salt === hcaSessionSalt(input))),
        );
      }),
    );

    it.effect(
      "the session digest and permission id equal HCASmartSessionLib.authorizationHashes",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;

          yield* holds(session, (input) =>
            chain
              .read({
                address: devnet.contract("hca.sessionHashes"),
                abi: sessionHashesAbi,
                functionName: "authorizationHashes",
                args: [input.account, input.sessionKey, input.salt],
              })
              .pipe(
                Effect.map(
                  ([permissionId, sessionDigest]) =>
                    sessionDigest === hcaSessionDigest(hcaSignedSession(input)) &&
                    permissionId === hcaSessionPermissionId(input),
                ),
              ),
          );
        }),
    );

    it.effect(
      "the multi-chain approval digest equals the contract's and depends on the chains' order",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const onChain = (sessions: readonly { chainId: number; session: Hex }[]) =>
            chain.read({
              address: devnet.contract("hca.sessionHashes"),
              abi: sessionHashesAbi,
              functionName: "multiChainDigest",
              args: [
                Arr.map(sessions, ({ chainId, session: sessionDigest }) => ({
                  chainId: BigInt(chainId),
                  sessionDigest,
                })),
              ],
            });

          yield* holds(chainSessions, (input) =>
            Effect.gen(function* () {
              const signed = Arr.map(input, ({ chainId, session: terms }) => ({
                chainId,
                session: hcaSignedSession(terms),
              }));
              const digests = Arr.map(signed, ({ chainId, session: signedSession }) => ({
                chainId,
                session: hcaSessionDigest(signedSession),
              }));
              const reversed = Arr.reverse(signed);
              const [digest, reversedDigest] = yield* Effect.all(
                [onChain(digests), onChain(Arr.reverse(digests))],
                { concurrency: 1 },
              );
              // Reversing reorders the chains unless they read the same both ways.
              const order = (list: typeof digests) =>
                Arr.join(
                  Arr.map(list, ({ chainId, session: digestOf }) => `${chainId}:${digestOf}`),
                  ",",
                );
              const palindrome = order(digests) === order(Arr.reverse(digests));
              return (
                digest === hcaSessionApprovalDigest(signed) &&
                reversedDigest === hcaSessionApprovalDigest(reversed) &&
                palindrome === (digest === reversedDigest)
              );
            }),
          );
        }),
    );

    it.effect(
      "an owner's signed approval is accepted, and any tampered chain, digest or index is not",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const { alice, bob, carol } = devnet.accounts;
          const owners = [alice, bob, carol] as const;
          // `HCASmartSessionLib.AuthorizationStatus.Valid`.
          const valid = 2;
          const approvals = Arbitrary.all({
            // The other chains' sessions; this chain's is inserted at `selected`.
            others: Arbitrary.array(
              Arbitrary.all({
                chainId: Arbitraries.uint(Number.MAX_SAFE_INTEGER),
                session,
              }),
              { maxLength: 3 },
            ),
            here: session,
            selected: Arbitraries.uint(3),
            owner: Arbitraries.uint(owners.length - 1),
            tampered: Arbitraries.uint(3),
          });

          yield* holds(approvals, (input) =>
            Effect.gen(function* () {
              const others = Arr.filter(input.others, ({ chainId }) => chainId !== devnet.chain.id);
              const selected = Math.min(input.selected, others.length);
              const entries = others.toSpliced(selected, 0, {
                chainId: devnet.chain.id,
                session: input.here,
              });
              const signed = Arr.map(entries, ({ chainId, session: terms }) => ({
                chainId,
                session: hcaSignedSession(terms),
              }));
              const digests = Arr.map(signed, ({ session: signedSession }) =>
                hcaSessionDigest(signedSession),
              );
              const owner = owners[input.owner] ?? alice;
              const signature = yield* chain.signTypedData({
                account: owner,
                ...hcaSessionTypedData(signed),
              });
              const digestAt = (index: number) => Option.getOrThrow(Arr.get(digests, index));
              const validate = (packed: readonly Hex[], index: number) =>
                chain.read({
                  address: devnet.contract("hca.sessionHashes"),
                  abi: sessionHashesAbi,
                  functionName: "validateMultiChainAuthorization",
                  args: [owner, digestAt(selected), BigInt(index), concat(packed), signature],
                });

              const packed = Arr.map(entries, ({ chainId }, index) =>
                entry(chainId, digestAt(index)),
              );
              const tampered = Math.min(input.tampered, packed.length - 1);
              const { chainId } = entries[tampered] ?? { chainId: 0 };
              const digest = digestAt(tampered);
              const [accepted, ...rejected] = yield* Effect.all(
                [
                  validate(packed, selected),
                  validate(packed.with(tampered, entry(chainId + 1, digest)), selected),
                  validate(packed.with(tampered, entry(chainId, keccak256(digest))), selected),
                  // Another chain's entry, or past the last one.
                  validate(packed, (selected + 1) % (packed.length + 1)),
                ],
                { concurrency: 1 },
              );
              return accepted === valid && Arr.every(rejected, (status) => status !== valid);
            }),
          );
        }),
    );
  });
});
