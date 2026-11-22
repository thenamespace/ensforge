import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Effect } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
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
const multicall = (calls: readonly `0x${string}`[]) =>
  encodeFunctionData({
    abi: Abis.v2.permissionedResolver,
    functionName: "multicall",
    args: [calls],
  });
/** The resolver deployment the session policy accepts: every role to the HCA, then the owner. */
const initialize = (
  grants: readonly { readonly account: Address; readonly roleBitmap: bigint }[] = [
    { account: hcaAddress, roleBitmap: Roles.enhancedAccessControl.allRoles },
    { account: owner, roleBitmap: Roles.enhancedAccessControl.allRoles },
  ],
  calls: readonly `0x${string}`[] = [],
) =>
  encodeFunctionData({
    abi: Abis.v2.permissionedResolver,
    functionName: "initialize",
    args: [grants, calls],
  });
const deployProxy = (implementation: Address, salt: bigint, initData = initialize()) =>
  to(
    v2.contracts.verifiableFactory,
    encodeFunctionData({
      abi: Abis.v2.verifiableFactory,
      functionName: "deployProxy",
      args: [implementation, salt, initData],
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
    [
      "an address record on the session resolver",
      to(
        resolver,
        encodeFunctionData({
          abi: Abis.v2.permissionedResolver,
          functionName: "setAddress",
          args: ["0x00", 60n, owner],
        }),
      ),
    ],
    [
      "a multicall of record setters",
      to(
        resolver,
        multicall([
          setText,
          encodeFunctionData({
            abi: Abis.v2.permissionedResolver,
            functionName: "setAddress",
            args: ["0x00", 60n, owner],
          }),
        ]),
      ),
    ],
    [
      "deploying the session resolver",
      deployProxy(v2.implementations.permissionedResolver, resolverSalt),
    ],
    [
      "the owner's default primary name",
      to(
        v2.contracts.defaultReverseRegistrarAdapter,
        encodeFunctionData({
          abi: Abis.v2.defaultReverseRegistrarAdapter,
          functionName: "setNameWithHCA",
          args: [owner, "alice.eth"],
        }),
      ),
    ],
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
    ...Arr.map(
      [
        [
          "the owner before the HCA",
          [
            { account: owner, roleBitmap: Roles.enhancedAccessControl.allRoles },
            { account: hcaAddress, roleBitmap: Roles.enhancedAccessControl.allRoles },
          ],
          [],
        ],
        [
          "fewer roles",
          [
            { account: hcaAddress, roleBitmap: Roles.enhancedAccessControl.allRoles },
            { account: owner, roleBitmap: 1n },
          ],
          [],
        ],
        [
          "a third account",
          [
            { account: hcaAddress, roleBitmap: Roles.enhancedAccessControl.allRoles },
            { account: owner, roleBitmap: Roles.enhancedAccessControl.allRoles },
            { account: stranger, roleBitmap: 1n },
          ],
          [],
        ],
        [
          "a call other than a record",
          undefined,
          [
            encodeFunctionData({
              abi: Abis.v2.permissionedResolver,
              functionName: "grantRootRoles",
              args: [1n, stranger],
            }),
          ],
        ],
      ] as const,
      ([what, grants, calls]) =>
        [
          `a session resolver created with ${what}`,
          deployProxy(
            v2.implementations.permissionedResolver,
            resolverSalt,
            initialize(grants, calls),
          ),
          "the session resolver gives every role to the HCA and the owner, and is created with records only",
        ] as const,
    ),
    [
      "someone else's primary name",
      to(
        v2.contracts.defaultReverseRegistrarAdapter,
        encodeFunctionData({
          abi: Abis.v2.defaultReverseRegistrarAdapter,
          functionName: "setNameWithHCA",
          args: [stranger, "alice.eth"],
        }),
      ),
      "primary names are for the HCA owner only",
    ],
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
      assert.include(String(error.details), reason);
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
  it.effect.each([
    [
      "a root role grant on the session resolver",
      to(
        resolver,
        encodeFunctionData({
          abi: Abis.v2.permissionedResolver,
          functionName: "grantRootRoles",
          args: [1n, owner],
        }),
      ),
    ],
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
    [
      "a multicall hiding a role grant",
      to(
        resolver,
        multicall([
          encodeFunctionData({
            abi: Abis.v2.permissionedResolver,
            functionName: "grantRootRoles",
            args: [1n, owner],
          }),
        ]),
      ),
    ],
  ] as const)("denies %s like the validator", ([, call]) =>
    expectFailure(check([call]), { _tag: "HcaError", code: "HCA_ACTION_NOT_ALLOWED" }),
  );
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
      const problem = yield* sessionProblem(client, { ...session, ...change });
      assert.strictEqual(problem, expected);
    }),
  );
});

// HCAOwnerAndSessionValidator `_checkRegistrationExecutions`: one permit pull of the refund token.
describe("checkSessionCalls with a funding pull", () => {
  const permit = (holder: Address, spender: Address, value: bigint, permitToken = token) =>
    to(
      permitToken,
      encodeFunctionData({
        abi: Abis.shared.erc2612,
        functionName: "permit",
        args: [holder, spender, value, 1n, 27, zeroHash, zeroHash],
      }),
    );
  const pull = (value: bigint, pullToken = token) =>
    to(
      pullToken,
      encodeFunctionData({
        abi: Abis.shared.erc20,
        functionName: "transferFrom",
        args: [owner, hcaAddress, value],
      }),
    );
  const commit = to(
    registrar,
    encodeFunctionData({ abi: Abis.v2.ethRegistrar, functionName: "commit", args: [zeroHash] }),
  );

  it.effect("allows the owner's permit and pull of the refund token next to an action", () =>
    check([permit(owner, hcaAddress, 5n), pull(5n), commit]),
  );

  it.effect.each([
    ["a pull without its permit", [pull(5n), commit]],
    ["a permit without its pull", [permit(owner, hcaAddress, 5n), commit]],
    ["the pair alone", [permit(owner, hcaAddress, 5n), pull(5n)]],
    ["another amount", [permit(owner, hcaAddress, 5n), pull(6n), commit]],
    ["another token", [permit(owner, hcaAddress, 5n, stranger), pull(5n, stranger), commit]],
    ["another spender", [permit(owner, stranger, 5n), pull(5n), commit]],
    ["another holder", [permit(stranger, hcaAddress, 5n), pull(5n), commit]],
    [
      "a second pair",
      [permit(owner, hcaAddress, 5n), pull(5n), permit(owner, hcaAddress, 5n), pull(5n), commit],
    ],
  ] as const)("refuses %s", ([, calls]) =>
    expectFailure(check(calls), { _tag: "HcaError", code: "HCA_ACTION_NOT_ALLOWED" }),
  );
});
