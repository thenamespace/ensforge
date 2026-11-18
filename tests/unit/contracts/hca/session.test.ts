import { assert, describe, it } from "@effect/vitest";
import { Array as Arr } from "effect";

import {
  hcaSessionApprovalDigest,
  hcaSessionDigest,
  hcaSessionPermissionId,
  hcaSessionSalt,
  hcaSessionTypes,
  hcaSignedSession,
  hcaSessionDomain,
} from "@ensforge/contracts/internal/v2/experimental/hca/index";
import {
  concat,
  domainSeparator,
  encodeAbiParameters,
  hashStruct,
  keccak256,
  maxUint256,
  numberToHex,
  pad,
  type Address,
} from "viem";

// Golden constants of contracts-v2 v1.0.1 `HCASmartSessionLib` (the deployed validator): the
// SDK's typed data must reproduce them exactly or owners sign digests the validator rejects.
const golden = {
  domainSeparator: "0xe4b7e03cf1e8e7a6af0eec6f72a68d532e03fdaad0b8326461731cb31803a084",
  signedSessionTypehash: "0x984917e689987af96289e12c5f5e934fcdf1df4186108f69ff7e8c3df950ce33",
  chainSessionTypehash: "0xabc350ff4773ba356e85e2d2ee58d7d7511767acdb108b59058f5b4a5afc074b",
  multiChainSessionTypehash: "0xb4323194e4ca3723804b96dc7a0960bde1afff2b080b8b288fdc264c82e21357",
  defaultPermissionsHash: "0x242b79d1322c5e6b12b617584cc2d5766cf18be6feb6acfa469ccf289e11e504",
  ownableSessionValidator: "0x000000000013fdB5234E4E3162a810F54d9f7E98",
  smartSessionEmissary: "0xad568B3F825A8d5FFc06DD3253526B64D810Ae89",
} as const;

const account: Address = "0x1111111111111111111111111111111111111111";
const sessionKey: Address = "0x2222222222222222222222222222222222222222";
const salt = hcaSessionSalt({
  sessionNonce: 3n,
  validUntil: 1_900_000_000,
  resolver: "0x3333333333333333333333333333333333333333",
  refundToken: "0x4444444444444444444444444444444444444444",
  maxRefundExchangeRate: 20_000_000_000n,
  maxRefundGasOverhead: 500_000n,
  maxRefundAmount: 100_000_000n,
});
const session = hcaSignedSession({ account, sessionKey, salt });

const validatorInitData = encodeAbiParameters(
  [{ type: "uint256" }, { type: "address[]" }],
  [1n, [sessionKey]],
);

// `HCASmartSessionLib.authorizationHashes`: the fixed-width struct the validator hashes.
const solidityDigest = keccak256(
  concat([
    golden.signedSessionTypehash,
    pad(account),
    numberToHex(maxUint256, { size: 32 }),
    numberToHex(0n, { size: 32 }),
    golden.defaultPermissionsHash,
    salt,
    pad(golden.ownableSessionValidator),
    keccak256(validatorInitData),
    pad(golden.smartSessionEmissary),
  ]),
);

describe("HCA session typed data", () => {
  it("domain is the deployed Smart Session domain", () => {
    assert.strictEqual(domainSeparator({ domain: hcaSessionDomain }), golden.domainSeparator);
  });

  it("default permissions hash to the validator's constant", () => {
    assert.strictEqual(
      hashStruct({
        types: hcaSessionTypes,
        primaryType: "SignedPermissions",
        data: session.permissions,
      }),
      golden.defaultPermissionsHash,
    );
  });

  it("session digest equals the validator's struct hash", () => {
    assert.strictEqual(hcaSessionDigest(session), solidityDigest);
  });

  it("permission id equals the validator's derivation", () => {
    const expected = keccak256(
      encodeAbiParameters(
        [{ type: "address" }, { type: "bytes" }, { type: "bytes32" }],
        [golden.ownableSessionValidator, validatorInitData, salt],
      ),
    );
    assert.strictEqual(hcaSessionPermissionId({ sessionKey, salt }), expected);
  });

  it.each([
    ["one chain", [[11155111, solidityDigest]]],
    [
      "several chains, in order",
      [
        [11155111, solidityDigest],
        [84532, solidityDigest],
      ],
    ],
  ] as const)("approval digest over %s equals the validator's", (_, chains) => {
    // `HCASmartSessionLib.multiChainDigest` over `chainSessionHash(chainId, digest)` entries.
    const chainHashes = Arr.map(chains, ([chainId, digest]) =>
      keccak256(concat([golden.chainSessionTypehash, numberToHex(chainId, { size: 32 }), digest])),
    );
    const structHash = keccak256(
      concat([golden.multiChainSessionTypehash, keccak256(concat(chainHashes))]),
    );

    assert.strictEqual(
      hcaSessionApprovalDigest(Arr.map(chains, ([chainId]) => ({ chainId, session }))),
      keccak256(concat(["0x1901", golden.domainSeparator, structHash])),
    );
  });

  it("the salt binds every term", () => {
    const terms = {
      sessionNonce: 0n,
      validUntil: 1,
      resolver: account,
      refundToken: sessionKey,
      maxRefundExchangeRate: 1n,
      maxRefundGasOverhead: 1n,
      maxRefundAmount: 1n,
    };
    const base = hcaSessionSalt(terms);
    const changed = Arr.map(
      [
        { sessionNonce: 1n },
        { validUntil: 2 },
        { resolver: sessionKey },
        { refundToken: account },
        { maxRefundExchangeRate: 2n },
        { maxRefundGasOverhead: 2n },
        { maxRefundAmount: 2n },
      ],
      (change) => hcaSessionSalt({ ...terms, ...change }),
    );
    assert.strictEqual(new Set([base, ...changed]).size, 8);
  });
});
