import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { checkSessionCalls, sessionProblem } from "@ensforge/hca/internal/internal/session";
import type { HcaSession } from "@ensforge/hca/internal/types";
import type { Plan } from "@ensforge/sdk";
import { expectFailure } from "@ensforge/test-harness";
import { encodeFunctionData, zeroAddress, zeroHash, type Address } from "viem";

import { hcaAddress, makeClient, owner, v2, verifiableProxy } from "../fixtures";

const resolverSalt = 7n;
const resolver = verifiableProxy(hcaAddress, resolverSalt);
const stranger: Address = "0x00000000000000000000000000000000000000bb";
const token: Address = "0x00000000000000000000000000000000000000cc";
const registrar = v2.contracts.ethRegistrar;

const session: HcaSession = {
  chainId: 11155111,
  hca: hcaAddress,
  owner,
  sessionKey: stranger,
  terms: {
    sessionNonce: 0n,
    validUntil: 4_000_000_000,
    resolver,
    refundToken: token,
    maxRefundExchangeRate: 1n,
    maxRefundGasOverhead: 1n,
    maxRefundAmount: 1n,
  },
  permissionId: zeroHash,
  sessionDigest: zeroHash,
  chains: [],
  ownerSignature: "0x",
  signingDomain: "smart-session",
};

const to = (address: Address, data: `0x${string}`, value = 0n): Plan.Call => ({
  to: address,
  data,
  value,
});
const register = (registrant: Address, subregistry: Address, registeredResolver: Address) =>
  to(
    registrar,
    encodeFunctionData({
      abi: Abis.v2.ethRegistrar,
      functionName: "register",
      args: [
        "alice",
        registrant,
        zeroHash,
        subregistry,
        registeredResolver,
        86400n,
        token,
        zeroHash,
      ],
    }),
  );
const setText = encodeFunctionData({
  abi: Abis.v2.permissionedResolver,
  functionName: "setText",
  args: ["0x00", "url", "https://alice.dev"],
});
const setAddress = encodeFunctionData({
  abi: Abis.v2.permissionedResolver,
  functionName: "setAddress",
  args: ["0x00", 60n, owner],
});
const grantRootRoles = encodeFunctionData({
  abi: Abis.v2.permissionedResolver,
  functionName: "grantRootRoles",
  args: [1n, owner],
});
const multicall = (calls: readonly `0x${string}`[]) =>
  encodeFunctionData({
    abi: Abis.v2.permissionedResolver,
    functionName: "multicall",
    args: [calls],
  });
const deployProxy = (implementation: Address, salt: bigint) =>
  to(
    v2.contracts.verifiableFactory,
    encodeFunctionData({
      abi: Abis.v2.verifiableFactory,
      functionName: "deployProxy",
      args: [implementation, salt, "0x"],
    }),
  );
const approve = (spender: Address) =>
  to(
    token,
    encodeFunctionData({ abi: Abis.shared.erc20, functionName: "approve", args: [spender, 1n] }),
  );
const claim = (account: Address, claimed: Address) =>
  to(
    v2.contracts.reverseRegistrarAdapter,
    encodeFunctionData({
      abi: Abis.v2.reverseRegistrarAdapter,
      functionName: "claimWithHCA",
      args: [account, claimed],
    }),
  );
const setName = (account: Address) =>
  to(
    v2.contracts.defaultReverseRegistrarAdapter,
    encodeFunctionData({
      abi: Abis.v2.defaultReverseRegistrarAdapter,
      functionName: "setNameWithHCA",
      args: [account, "alice.eth"],
    }),
  );

const check = (calls: readonly Plan.Call[]) =>
  checkSessionCalls(makeClient().client, session, calls);

// Mirrors HCAOwnerAndSessionValidator / HCAResolverPolicyLib at contracts-v2 v1.0.1.
describe("checkSessionCalls", () => {
  it.effect.each([
    [
      "a commitment",
      to(
        registrar,
        encodeFunctionData({ abi: Abis.v2.ethRegistrar, functionName: "commit", args: [zeroHash] }),
      ),
    ],
    [
      "a registration to the owner with the session resolver",
      register(owner, zeroAddress, resolver),
    ],
    ["a text record on the session resolver", to(resolver, setText)],
    ["an address record on the session resolver", to(resolver, setAddress)],
    ["a multicall of record setters", to(resolver, multicall([setText, setAddress]))],
    [
      "deploying the session resolver",
      deployProxy(v2.implementations.permissionedResolver, resolverSalt),
    ],
    ["the owner's default primary name", setName(owner)],
    ["the owner's reverse claim with the session resolver", claim(owner, resolver)],
    ["the owner's reverse claim without a resolver", claim(owner, zeroAddress)],
    ["a payment approval to the registrar", approve(registrar)],
  ] as const)("allows %s", ([, call]) => check([call]));

  it.effect.each([
    ["value", to(resolver, setText, 1n), "sessions send no value"],
    [
      "another registrar function",
      to(
        registrar,
        encodeFunctionData({
          abi: Abis.v2.ethRegistrar,
          functionName: "commitmentAt",
          args: [zeroHash],
        }),
      ),
      "only commit and register are allowed",
    ],
    [
      "a registration to someone else",
      register(stranger, zeroAddress, resolver),
      "names must be registered to the HCA owner",
    ],
    [
      "a registration with a subregistry",
      register(owner, stranger, resolver),
      "the subregistry must be empty",
    ],
    [
      "a registration with another resolver",
      register(owner, zeroAddress, stranger),
      "the resolver must be the session's",
    ],
    ["a record on another resolver", to(stranger, setText), "not part of the session policy"],
    [
      "another implementation",
      deployProxy(stranger, resolverSalt),
      "only the approved PermissionedResolver",
    ],
    [
      "another resolver's deployment",
      deployProxy(v2.implementations.permissionedResolver, 8n),
      "only the session resolver may be deployed",
    ],
    ["someone else's primary name", setName(stranger), "primary names are for the HCA owner only"],
    [
      "a reverse claim with another resolver",
      claim(owner, stranger),
      "reverse claims are for the owner and the session resolver",
    ],
    [
      "an approval to another spender",
      approve(stranger),
      "payment approvals go to the registrar only",
    ],
    ["an unrelated call", to(stranger, "0x12345678"), "not part of the session policy"],
  ] as const)("denies %s", ([, call, reason]) =>
    Effect.gen(function* () {
      const error = yield* expectFailure(check([call]), {
        _tag: "HcaError",
        code: "HCA_ACTION_NOT_ALLOWED",
      });
      assert.include(String((error as { details?: readonly string[] }).details), reason);
    }),
  );

  it.effect("denies the first disallowed call of a batch", () =>
    expectFailure(check([to(resolver, setText), approve(stranger)]), {
      _tag: "HcaError",
      code: "HCA_ACTION_NOT_ALLOWED",
    }),
  );

  // HCAResolverPolicyLib accepts only record setters on the resolver, and `multicall` of them
  // checked recursively.
  const validatorDenies = [
    ["a root role grant on the session resolver", to(resolver, grantRootRoles)],
    [
      "multicallWithNodeCheck",
      to(
        resolver,
        encodeFunctionData({
          abi: Abis.v2.permissionedResolver,
          functionName: "multicallWithNodeCheck",
          args: [zeroHash, [setText]],
        }),
      ),
    ],
    ["a multicall hiding a role grant", to(resolver, multicall([grantRootRoles]))],
  ] as const;
  for (const [name, call] of validatorDenies) {
    it.effect(`denies ${name} like the validator`, () =>
      expectFailure(check([call]), { _tag: "HcaError", code: "HCA_ACTION_NOT_ALLOWED" }),
    );
  }
});

describe("sessionProblem", () => {
  it.effect.each([
    ["usable", {}, {}, undefined],
    ["on another chain", { chainId: 1 }, {}, "chain"],
    ["expired", { terms: { ...session.terms, validUntil: 1 } }, {}, "expired"],
    // Regression: expiry followed the local clock; the validator follows the block's timestamp.
    [
      "expired by chain time, before the local clock",
      { terms: { ...session.terms, validUntil: 3_000_000_000 } },
      { now: 3_000_000_001n },
      "expired",
    ],
    [
      "usable by chain time, after the local clock",
      { terms: { ...session.terms, validUntil: 1_000_000_000 } },
      { now: 999_999_999n },
      undefined,
    ],
    ["signed under another domain", { signingDomain: "hca" }, {}, "signing-domain"],
    ["revoked by a newer session nonce", {}, { sessionNonce: 1n }, "revoked"],
  ] as const)("reports a session that is %s", ([, change, world, expected]) =>
    Effect.gen(function* () {
      const { client } = makeClient({ deployed: true, ...world });
      const problem = yield* sessionProblem(client, { ...session, ...change } as HcaSession);
      assert.strictEqual(problem, expected);
    }),
  );
});
