import { assert, describe } from "@effect/vitest";
import { Effect, Array as Arr } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import {
  hcaOwnerAndSessionValidatorV2Abi,
  hcaSessionSalt,
  hcaSessionTypedData,
  hcaSignedSession,
  standaloneSingleOwnerHcaV2Abi,
} from "@ensforge/contracts/v2/experimental/hca";
import { hca, rhinestone, type HcaSession } from "@ensforge/hca";
import { Actions as HcaActions } from "@ensforge/hca/effect";
import { Duration } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import {
  ContractFunctionRevertedError,
  concat,
  domainSeparator,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  hashStruct,
  hexToNumber,
  keccak256,
  numberToHex,
  pad,
  size,
  slice,
  toHex,
  zeroAddress,
  type Address,
  BaseError,
  type Hex,
} from "viem";

import { Clients } from "../support/clients.ts";
import { ethEntry, mintUsdc, usdcOf } from "../support/contracts.ts";
import { onProfile } from "../support/lane.ts";
import { Rhinestone } from "../support/rhinestone.ts";

// A session ensforge authorized, enabled the way Rhinestone's IntentExecutor presents it: a
// first-use envelope (`FIXED_SESSION_REFUND_ENABLE_MODE`) carrying the owner's approval, checked by
// the deployed HCAOwnerAndSessionValidator through the HCA's ERC-1271 `isValidSignature`.

type Refund = { readonly token: Address; readonly exchangeRate: bigint; readonly amount: bigint };

/** The intent digest the executor asks the HCA to validate, and the envelope for it. */
const sessionEnvelope = Effect.fnUntraced(function* (
  session: HcaSession,
  options: {
    readonly calls: readonly { readonly to: Address; readonly data: Hex }[];
    readonly refund?: Refund;
    readonly ownerSignature?: Hex;
  },
) {
  const devnet = yield* Devnet;
  const chain = yield* Chain;
  const { calls, refund = { token: zeroAddress, exchangeRate: 0n, amount: 0n } } = options;
  const executor = devnet.contract("hca.intentExecutor");
  const nonce = 7n;

  // ERC-7579 batch in ERC-1271 mode (0x0201), packed as HCAOperationHashLib decodes it.
  const mode = pad("0x0201", { dir: "right" });
  const operation = concat([
    "0x0201",
    numberToHex(calls.length, { size: 1 }),
    ...Arr.flatMap(calls, (call) => [
      call.to,
      numberToHex(size(call.data), { size: 3 }),
      call.data,
    ]),
  ]);
  const operationHash = hashStruct({
    types: {
      Op: [
        { name: "vt", type: "bytes32" },
        { name: "ops", type: "Ops[]" },
      ],
      Ops: [
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "data", type: "bytes" },
      ],
    },
    primaryType: "Op",
    data: {
      vt: mode,
      ops: Arr.map(calls, (call) => ({ to: call.to, value: 0n, data: call.data })),
    },
  });

  // The IntentExecutor's single-chain digest, with the validator's type hashes.
  const refundHash =
    refund.token === zeroAddress
      ? "0x44db4de84d423abe696e354fc99de162153ee2f8985ab84305061247a78a3be4"
      : keccak256(
          encodeAbiParameters(
            [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }],
            [
              "0x0bf04d9dcc5e703a75ba16d19c00f9d87fa30b9a815627102c15624d338eb094",
              refund.token,
              refund.exchangeRate,
              refund.amount << 128n,
            ],
          ),
        );
  const hash = keccak256(
    concat([
      "0x1901",
      domainSeparator({
        domain: {
          name: "IntentExecutor",
          version: "v0.0.1",
          chainId: devnet.chain.id,
          verifyingContract: executor,
        },
      }),
      keccak256(
        encodeAbiParameters(
          [
            { type: "bytes32" },
            { type: "address" },
            { type: "uint256" },
            { type: "bytes32" },
            { type: "bytes32" },
          ],
          [
            "0xbae11135c33effc421d699bbb53d9926a005ed0f2f5eb672c62cbfa943807291",
            session.hca,
            nonce,
            operationHash,
            refundHash,
          ],
        ),
      ),
    ]),
  );

  // The session key signs the digest with `eth_sign`; v + 4 tells the validator it is EIP-191.
  const signed = yield* chain.sign(session.sessionKey, hash);
  const sessionSignature = concat([
    slice(signed, 0, 64),
    toHex(hexToNumber(slice(signed, 64)) + 4),
  ]);

  const { terms } = session;
  const data = concat([
    encodePacked(
      [
        "bytes1",
        "bytes32",
        "address",
        "uint48",
        "uint96",
        "address",
        "address",
        "uint96",
        "uint48",
        "uint96",
        "uint8",
        "uint8",
      ],
      [
        "0x05",
        session.permissionId,
        session.sessionKey,
        terms.validUntil,
        terms.sessionNonce,
        terms.resolver,
        terms.refundToken,
        terms.maxRefundExchangeRate,
        Number(terms.maxRefundGasOverhead),
        terms.maxRefundAmount,
        0,
        session.chains.length,
      ],
    ),
    ...Arr.flatMap(session.chains, ({ chainId, sessionDigest }) => [
      numberToHex(chainId, { size: 8 }),
      sessionDigest,
    ]),
    options.ownerSignature ?? session.ownerSignature,
    encodePacked(
      ["uint256", "address", "uint96", "uint96", "uint48"],
      [nonce, refund.token, refund.exchangeRate, refund.amount, 0],
    ),
    operation,
    sessionSignature,
  ]);
  return { hash, data };
});

/** What the validator answers the HCA for `envelope`: the ERC-1271 magic value, or its error. */
const verdict = Effect.fnUntraced(function* (
  session: HcaSession,
  envelope: { readonly hash: Hex; readonly data: Hex },
) {
  const devnet = yield* Devnet;
  const chain = yield* Chain;

  return yield* chain
    .read({
      address: devnet.contract("hca.ownerAndSessionValidator"),
      abi: hcaOwnerAndSessionValidatorV2Abi,
      functionName: "isValidSignatureWithSender",
      args: [devnet.contract("hca.intentExecutor"), envelope.hash, envelope.data],
      account: session.hca,
    })
    .pipe(
      Effect.match({
        onSuccess: (magicValue): string => magicValue,
        onFailure: (error) => {
          const reverted =
            error.cause instanceof BaseError
              ? error.cause.walk((cause) => cause instanceof ContractFunctionRevertedError)
              : null;
          return reverted instanceof ContractFunctionRevertedError
            ? (reverted.data?.errorName ?? "no revert data")
            : "no revert data";
        },
      }),
    );
});

describe("HCA sessions on the validator", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "accepts an authorized session's first use, and refuses one outside its approval",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const { alice, bob } = devnet.accounts;
          const ens = clients.make({ account: alice });
          const registrar = devnet.contract("v2.ethRegistrar");
          const resolver = devnet.contract("v2.publicResolver");
          const commit = {
            to: registrar,
            data: encodeFunctionData({
              abi: Abis.v2.ethRegistrar,
              functionName: "commit",
              args: [keccak256("0x01")],
            }),
          };

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* HcaActions.hca.deploySync(ens, {});
              const now = yield* chain.now;
              const session = yield* HcaActions.hca.authorizeSession(ens, {
                sessionKey: bob,
                resolver,
                validUntil: Number(now) + 3600,
              });
              const envelope = yield* sessionEnvelope(session, { calls: [commit] });

              // As the IntentExecutor asks it: through the HCA, behind the default-validator prefix.
              const magicValue = yield* chain.read({
                address: session.hca,
                abi: standaloneSingleOwnerHcaV2Abi,
                functionName: "isValidSignature",
                args: [envelope.hash, concat([zeroAddress, envelope.data])],
                account: devnet.contract("hca.intentExecutor"),
              });
              assert.strictEqual(magicValue, "0x1626ba7e");
              const sessionVerdict = yield* verdict(session, envelope);
              assert.strictEqual(sessionVerdict, "0x1626ba7e");

              // Another signer's approval of the same session.
              const forged = yield* chain.signTypedData({
                account: bob,
                ...hcaSessionTypedData([
                  {
                    chainId: session.chainId,
                    session: hcaSignedSession({
                      account: session.hca,
                      sessionKey: session.sessionKey,
                      salt: hcaSessionSalt(session.terms),
                    }),
                  },
                ]),
              });
              const forgedEnvelope = yield* sessionEnvelope(session, {
                calls: [commit],
                ownerSignature: forged,
              });
              const forgedVerdict = yield* verdict(session, forgedEnvelope);
              assert.strictEqual(forgedVerdict, "InvalidSigner");

              // A registration with a subregistry is outside the session policy.
              const register = {
                to: registrar,
                data: encodeFunctionData({
                  abi: Abis.v2.ethRegistrar,
                  functionName: "register",
                  args: [
                    "session-name",
                    alice,
                    keccak256("0x02"),
                    bob,
                    resolver,
                    31_536_000n,
                    zeroAddress,
                    keccak256("0x"),
                  ],
                }),
              };
              const registerEnvelope = yield* sessionEnvelope(session, { calls: [register] });
              const registerVerdict = yield* verdict(session, registerEnvelope);
              assert.strictEqual(registerVerdict, "PolicyRuleFailed");

              // A gas refund above the session's exchange-rate ceiling.
              const refundEnvelope = yield* sessionEnvelope(session, {
                calls: [commit],
                refund: {
                  token: session.terms.refundToken,
                  exchangeRate: session.terms.maxRefundExchangeRate + 1n,
                  amount: 1n,
                },
              });
              const refundVerdict = yield* verdict(session, refundEnvelope);
              assert.strictEqual(refundVerdict, "GasRefundNotAllowed");

              yield* chain.atTimestamp(
                BigInt(session.terms.validUntil) + 1n,
                Effect.gen(function* () {
                  const expiredVerdict = yield* verdict(session, envelope);
                  assert.strictEqual(expiredVerdict, "InvalidSessionData");
                }),
              );

              yield* HcaActions.hca.revokeSessionsSync(ens, {});
              const revokedVerdict = yield* verdict(session, envelope);
              assert.strictEqual(revokedVerdict, "InvalidSessionData");
            }),
          );
        }),
      { meta: { cases: ["Z02", "Z03", "Z05"] } },
    );

    it.effect(
      "writes records with a session through rhinestone(), checked by the validator",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const rhinestoneDevnet = yield* Rhinestone;
          const { carol, bob } = devnet.accounts;
          const ens = clients.make({ account: carol });
          const name = "hca-session-records.eth";

          yield* chain.isolated(
            Effect.gen(function* () {
              const account = yield* HcaActions.hca.predictAddress(ens, {});
              yield* mintUsdc(account, 1_000_000_000n);
              yield* Actions.registration.registerSync(ens, {
                names: name,
                duration: Duration.years(1),
                resolver: "owned",
                via: hca(),
                onStep: chain.passWaits,
              });
              const resolver = (yield* Actions.resolver.get(ens, { name }))?.address ?? zeroAddress;
              const now = yield* chain.now;
              const session = yield* HcaActions.hca.authorizeSession(ens, {
                sessionKey: bob,
                resolver,
                validUntil: Number(now) + 3600,
              });

              // The intent carries the session's terms and approval as the patched SDK packs them.
              const filled = rhinestoneDevnet.filled();
              yield* Actions.record.setSync(ens, {
                name,
                texts: { url: "https://session.example" },
                via: hca({
                  executors: [
                    rhinestone({
                      sdk: rhinestoneDevnet.sdk,
                      sessionSigner: rhinestoneDevnet.signer(bob),
                    }),
                  ],
                  session,
                }),
              });

              const url = yield* Actions.record.getText(ens, { name, key: "url" });
              assert.strictEqual(url, "https://session.example");
              assert.strictEqual(rhinestoneDevnet.filled(), filled + 1);
            }),
          );
        }),
      { meta: { cases: ["Z02"] } },
    );

    it.effect(
      "registers with a session, pulling the price from the owner's wallet with a permit",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const rhinestoneDevnet = yield* Rhinestone;
          const { carol, bob } = devnet.accounts;
          const ens = clients.make({ account: carol });

          yield* chain.isolated(
            Effect.gen(function* () {
              // A first registration through the owner deploys the HCA and its shared resolver.
              yield* mintUsdc(carol, 1_000_000_000n);
              yield* Actions.registration.registerSync(ens, {
                names: "hca-session-first.eth",
                duration: Duration.years(1),
                resolver: "owned",
                via: hca(),
                onStep: chain.passWaits,
              });
              const account = yield* HcaActions.hca.predictAddress(ens, {});
              const resolver =
                (yield* Actions.resolver.get(ens, { name: "hca-session-first.eth" }))?.address ??
                zeroAddress;
              const now = yield* chain.now;
              const session = yield* HcaActions.hca.authorizeSession(ens, {
                sessionKey: bob,
                resolver,
                validUntil: Number(now) + 3600,
              });
              const held = yield* usdcOf(account);
              const before = yield* usdcOf(carol);

              const result = yield* Actions.registration.registerSync(ens, {
                names: "hca-session-funded.eth",
                duration: Duration.years(1),
                resolver: "owned",
                via: hca({
                  executors: [
                    rhinestone({
                      sdk: rhinestoneDevnet.sdk,
                      sessionSigner: rhinestoneDevnet.signer(bob),
                    }),
                  ],
                  session,
                }),
                onStep: chain.passWaits,
              });

              assert.strictEqual((yield* ethEntry("hca-session-funded.eth")).owner, carol);
              const pulled = before - (yield* usdcOf(carol));
              assert.strictEqual(held + pulled - (yield* usdcOf(account)), result.paid);
              assert.include(
                Arr.map(result.plan.warnings, (warning) => warning.code),
                "HCA_FUNDING",
              );
            }),
          );
        }),
      { meta: { cases: ["Z02"] } },
    );

    it.effect(
      "registers a fresh name with records and a primary name through a session, in one reveal",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const rhinestoneDevnet = yield* Rhinestone;
          // An account the fixtures gave no HCA.
          const { user, bob } = devnet.accounts;
          const ens = clients.make({ account: user });
          const name = "hca-session-fresh.eth";

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* mintUsdc(user, 1_000_000_000n);
              const now = yield* chain.now;
              // The session's resolver defaults to the HCA's shared one, which it may deploy.
              const session = yield* HcaActions.hca.authorizeSession(ens, {
                sessionKey: bob,
                validUntil: Number(now) + 3600,
              });
              const filled = rhinestoneDevnet.filled();

              const result = yield* Actions.registration.registerSync(ens, {
                names: name,
                duration: Duration.years(1),
                records: { texts: { url: "https://fresh.example" } },
                primaryName: true,
                via: hca({
                  executors: [
                    rhinestone({
                      sdk: rhinestoneDevnet.sdk,
                      sessionSigner: rhinestoneDevnet.signer(bob),
                    }),
                  ],
                  session,
                }),
                onStep: chain.passWaits,
              });

              // Two intents, the commit and the reveal; the wallet signed only the session and
              // the funding permit.
              assert.deepStrictEqual(
                Arr.map(result.plan.steps, (step) => step.from ?? "hca"),
                ["hca", "hca"],
              );
              assert.strictEqual(rhinestoneDevnet.filled(), filled + 2);
              const resolver = yield* Actions.resolver.get(ens, { name });
              assert.strictEqual(resolver?.address, session.terms.resolver);
              const holders = yield* Effect.forEach(
                [session.hca, user],
                (account) =>
                  chain.read({
                    address: session.terms.resolver,
                    abi: Abis.v2.permissionedResolver,
                    functionName: "hasRootRoles",
                    args: [Roles.enhancedAccessControl.allRoles, account],
                  }),
                { concurrency: 1 },
              );
              assert.deepStrictEqual(holders, [true, true]);
              const url = yield* Actions.record.getText(ens, { name, key: "url" });
              assert.strictEqual(url, "https://fresh.example");
              const primary = yield* Actions.primaryName.get(ens, { address: user });
              assert.strictEqual(primary, name);
              const allowance = yield* chain.read({
                address: devnet.contract("v2.usdc"),
                abi: Abis.shared.erc20,
                functionName: "allowance",
                args: [session.hca, devnet.contract("v2.ethRegistrar")],
              });
              assert.strictEqual(allowance, 0n);
            }),
          );
        }),
      { meta: { cases: ["Z02"] } },
    );
  });
});
