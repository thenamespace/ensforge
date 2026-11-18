import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { Actions as HcaActions } from "@ensforge/hca/effect";
import { Duration, Name } from "@ensforge/sdk";
import { Actions, type Errors } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import {
  bytesToHex,
  decodeErrorResult,
  encodeFunctionData,
  erc20Abi,
  keccak256,
  namehash,
  numberToHex,
  toHex,
  zeroAddress,
  zeroHash,
  type Abi,
  type Address,
  type BaseError,
  type Hex,
} from "viem";
import { packetToBytes } from "viem/ens";

import { Clients } from "../support/clients.ts";
import { ethEntry } from "../support/contracts.ts";
import { RecordType, txtProof, type Tampering } from "../support/dnssec.ts";
import { onProfile } from "../support/lane.ts";

// Each contract error the SDK maps (`revertMap`) is raised here by a deployed contract, so the
// mapping matches what the contracts really revert with. `revert-map.test.ts` lists the rest.

const stranger = "0x000000000000000000000000000000000000dEaD";

type Call = {
  readonly from: Address;
  readonly to: Address;
  readonly abi: Abi;
  readonly functionName: string;
  readonly args: readonly unknown[];
};

/** The name of the ENS error `call` reverts with. */
const revertOf = Effect.fnUntraced(function* ({ from, to, abi, functionName, args }: Call) {
  const chain = yield* Chain;
  const data = encodeFunctionData({ abi, functionName, args } as never);

  return yield* chain.call({ account: from, to, data }).pipe(
    Effect.match({
      onSuccess: () => "no revert",
      onFailure: (error) => {
        const reverted = (error.cause as BaseError).walk(
          (cause) => typeof (cause as { data?: unknown }).data === "string",
        ) as { readonly data: Hex } | null;
        return reverted === null
          ? "no revert data"
          : decodeErrorResult({ abi: Abis.shared.errors, data: reverted.data }).errorName;
      },
    }),
  );
});

/** The contract error an ensforge call failed with, from its error context. */
const revertName = <A>(effect: Effect.Effect<A, Errors.AnyError>) =>
  effect.pipe(
    Effect.match({
      onSuccess: () => "no revert",
      onFailure: (error) =>
        (error.context as { readonly revert?: { readonly errorName?: string } } | undefined)?.revert
          ?.errorName,
    }),
  );

describe("contract errors", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect("come from the registries and the NameWrapper", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const devnet = yield* Devnet;
        const chain = yield* Chain;
        const { reader } = yield* Clients;
        const { alice, carol, user } = devnet.accounts;
        const registered = (yield* ethEntry(fixtures.byId("v2.registered").name)).tokenId;
        const delegated = (yield* ethEntry(fixtures.byId("v2.roles").name)).tokenId;
        const expired = (yield* ethEntry(fixtures.byId("v2.expired").name)).tokenId;

        // A child in a user registry: its expiry is set there, and never lowered.
        const child = Name.parse(fixtures.byId("v2.subnames").name);
        const subregistry = yield* Actions.registry.get(reader, {
          name: child.parent ?? assert.fail("a subname has a parent"),
        });
        if (subregistry === null) return assert.fail(`${child.parent} has no registry`);
        const childToken = yield* chain.read({
          address: subregistry.address,
          abi: Abis.v2.permissionedRegistry,
          functionName: "findTokenId",
          args: [child.label],
        });

        const registry = {
          to: devnet.contract("v2.ethRegistry"),
          abi: Abis.v2.permissionedRegistry as Abi,
        };
        const wrapper = { to: devnet.contract("v1.nameWrapper"), abi: Abis.v1.nameWrapper as Abi };
        const transfer = (from: Address, owner: Address, token: bigint) => ({
          ...registry,
          from,
          functionName: "safeTransferFrom",
          args: [owner, carol, token, 1n, "0x"],
        });

        const cases: Readonly<Record<string, Call>> = {
          EACUnauthorizedAccountRoles: {
            ...registry,
            from: user,
            functionName: "setResolver",
            args: [registered, stranger],
          },
          EACCannotGrantRoles: {
            ...registry,
            from: user,
            functionName: "grantRoles",
            args: [registered, Roles.registry.setResolver, user],
          },
          EACCannotRevokeRoles: {
            ...registry,
            from: user,
            functionName: "revokeRoles",
            args: [delegated, Roles.registry.setResolver, carol],
          },
          EACInvalidAccount: {
            ...registry,
            from: alice,
            functionName: "grantRoles",
            args: [registered, Roles.registry.setResolver, zeroAddress],
          },
          ERC1155InsufficientBalance: transfer(user, user, registered),
          ERC1155MissingApprovalForAll: transfer(user, alice, registered),
          TransferUnsafeWithMultipleAssignees: transfer(alice, alice, delegated),
          TransferDisallowed: transfer(alice, alice, expired),
          LabelExpired: {
            ...registry,
            from: alice,
            functionName: "setResolver",
            args: [expired, stranger],
          },
          CannotReduceExpiry: {
            to: subregistry.address,
            abi: Abis.v2.permissionedRegistry as Abi,
            from: alice,
            functionName: "renew",
            args: [childToken, 1n],
          },
          Unauthorised: {
            ...wrapper,
            from: user,
            functionName: "setResolver",
            args: [namehash(fixtures.byId("v1.wrapped").name), stranger],
          },
          OperationProhibited: {
            ...wrapper,
            from: alice,
            functionName: "setTTL",
            args: [namehash(fixtures.byId("v1.wrapped.locked.cannot-set-ttl").name), 1n],
          },
        };

        for (const [error, call] of Object.entries(cases)) {
          assert.strictEqual(yield* revertOf(call), error);
        }

        // Alice and carol hold setResolver; thirteen more fill its count of fifteen holders.
        yield* chain.isolated(
          Effect.gen(function* () {
            for (let holder = 1; holder <= 13; holder++) {
              yield* chain.write({
                account: alice,
                address: registry.to,
                abi: Abis.v2.permissionedRegistry,
                functionName: "grantRoles",
                args: [delegated, Roles.registry.setResolver, numberToHex(holder, { size: 20 })],
              });
            }
            assert.strictEqual(
              yield* revertOf({
                ...registry,
                from: alice,
                functionName: "grantRoles",
                args: [delegated, Roles.registry.setResolver, numberToHex(14, { size: 20 })],
              }),
              "EACMaxAssignees",
            );
          }),
        );
      }),
    );

    it.effect("come from the ETH registrar and its payment token", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const devnet = yield* Devnet;
        const chain = yield* Chain;
        const { alice, user } = devnet.accounts;
        const registrar = {
          to: devnet.contract("v2.ethRegistrar"),
          abi: Abis.v2.ethRegistrar as Abi,
        };
        const usdc = devnet.contract("v2.usdc");
        const secret = keccak256(toHex("reverts"));
        const taken = Name.parse(fixtures.byId("v2.registered").name).label;
        const register = (
          from: Address,
          label: string,
          options: { readonly duration?: bigint; readonly token?: Address } = {},
        ): Call => ({
          ...registrar,
          from,
          functionName: "register",
          args: [
            label,
            alice,
            secret,
            zeroAddress,
            zeroAddress,
            options.duration ?? Duration.years(1),
            options.token ?? usdc,
            zeroHash,
          ],
        });
        const commit = Effect.fnUntraced(function* (label: string, duration = Duration.years(1)) {
          const commitment = yield* chain.read({
            address: registrar.to,
            abi: Abis.v2.ethRegistrar,
            functionName: "makeCommitment",
            args: [label, alice, secret, zeroAddress, zeroAddress, duration, zeroHash],
          });
          yield* chain.write({
            address: registrar.to,
            abi: Abis.v2.ethRegistrar,
            functionName: "commit",
            args: [commitment],
            account: alice,
          });
          return commitment;
        });

        yield* chain.isolated(
          Effect.gen(function* () {
            const plain = yield* commit("qqqqq");
            yield* commit("rrrrr", 1n);
            yield* commit(taken);
            assert.strictEqual(
              yield* revertOf({
                ...registrar,
                from: alice,
                functionName: "commit",
                args: [plain],
              }),
              "UnexpiredCommitmentExists",
            );
            assert.strictEqual(yield* revertOf(register(alice, "qqqqq")), "CommitmentTooNew");

            yield* chain.increaseTime(120);
            yield* chain.mine();
            assert.strictEqual(
              yield* revertOf(register(user, "qqqqq")),
              "ERC20InsufficientAllowance",
            );
            yield* chain.write({
              address: usdc,
              abi: erc20Abi,
              functionName: "approve",
              args: [registrar.to, 10n ** 30n],
              account: user,
            });
            assert.strictEqual(
              yield* revertOf(register(user, "qqqqq")),
              "ERC20InsufficientBalance",
            );
            assert.strictEqual(
              yield* revertOf(register(alice, "qqqqq", { token: stranger })),
              "PaymentTokenNotSupported",
            );
            assert.strictEqual(
              yield* revertOf(register(alice, "rrrrr", { duration: 1n })),
              "DurationTooShort",
            );
            assert.strictEqual(yield* revertOf(register(alice, taken)), "NameNotAvailable");

            yield* chain.increaseTime(Number(Duration.days(8)));
            yield* chain.mine();
            assert.strictEqual(yield* revertOf(register(alice, "qqqqq")), "CommitmentTooOld");
          }),
        );
      }),
    );

    it.effect("come from the DNSSEC oracle and the DNS registrars", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const chain = yield* Chain;
        const { alice } = devnet.accounts;
        const at = Number(yield* chain.now);
        const name = "reverts-dns.com";
        const owner = [`a=${alice}`];
        const proof = (tampered: Tampering = {}, inception = at - 60) =>
          txtProof(name, owner, inception, tampered);
        const oracle = {
          to: devnet.contract("v1.dnssecOracle"),
          abi: Abis.v1.dnssecOracle as Abi,
          from: alice,
          functionName: "verifyRRSet",
        };
        const registrar = {
          to: devnet.contract("v1.dnsRegistrar"),
          abi: Abis.v1.dnsRegistrar as Abi,
          from: alice,
          functionName: "proveAndClaim",
        };
        const verify = (rrsets: ReturnType<typeof txtProof>): Call => ({
          ...oracle,
          args: [rrsets],
        });
        const claim = (dnsName: string, rrsets: ReturnType<typeof txtProof>): Call => ({
          ...registrar,
          args: [bytesToHex(packetToBytes(dnsName)), rrsets],
        });
        const [rootKeys, signed] = proof();

        const cases: Readonly<Record<string, Call>> = {
          SignatureNotValidYet: verify(proof({}, at + 86_400)),
          SignatureExpired: verify(proof({ expiration: at - 30 })),
          NoMatchingProof: verify(proof({ keyTag: 999 })),
          InvalidLabelCount: verify(proof({ labels: 1 })),
          InvalidSignerName: verify(proof({ signer: "org" })),
          ProofNameMismatch: verify(proof({ signer: "com" })),
          SignatureTypeMismatch: verify(proof({ covered: RecordType.dnskey })),
          InvalidClass: verify(proof({ dnsClass: 3 })),
          InvalidRRSet: verify(
            txtProof(name, [...owner, "v=spf1 -all"], at - 60, {
              recordNames: [`_ens.${name}`, "_ens.other.com"],
            }),
          ),
          // A TXT set cannot prove the next set: only DNSKEY and DS sets can.
          InvalidProofType: verify([rootKeys, signed, signed].filter((set) => set !== undefined)),
          NoOwnerRecordFound: claim(name, txtProof(name, ["v=spf1 -all"], at - 60)),
          InvalidPublicSuffix: claim(
            "reverts-dns.test",
            txtProof("reverts-dns.test", owner, at - 60),
          ),
          TLDNotPublic: {
            to: devnet.contract("v2.temporaryDnsRegistrar"),
            abi: Abis.v2.temporaryDnsRegistrar as Abi,
            from: alice,
            functionName: "syncTLD",
            args: ["test"],
          },
        };
        for (const [error, call] of Object.entries(cases)) {
          assert.strictEqual(yield* revertOf(call), error, error);
        }

        // DNSRegistrar takes no proof older than the one it imported.
        yield* chain.isolated(
          Effect.gen(function* () {
            yield* chain.write({
              address: registrar.to,
              abi: Abis.v1.dnsRegistrar,
              functionName: "proveAndClaim",
              args: [bytesToHex(packetToBytes(name)), proof()],
              account: alice,
            });
            assert.strictEqual(yield* revertOf(claim(name, proof({}, at - 3600))), "StaleProof");
          }),
        );
      }),
    );

    // `resolver.none` is premigrated: ENSv2 hands it to the ENSv1 bridge, which finds no ENSv1
    // resolver but `eth`'s, the ENSv2 bridge, which points back; the loop ends in UnreachableName.
    it.effect(
      "come from the Universal Resolver, through ensforge's reads",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const clients = yield* Clients;

          assert.strictEqual(
            yield* revertName(
              Actions.record.getText(clients.reader, {
                name: fixtures.byId("resolver.none").name,
                key: "url",
                strict: true,
              }),
            ),
            "UnreachableName",
          );
          assert.strictEqual(
            yield* revertName(
              Actions.record.getText(clients.make({ ccipRead: false }), {
                name: fixtures.byId("resolver.offchain").name,
                key: "url",
              }),
            ),
            "OffchainLookup",
          );
        }),
      { meta: { cases: ["O24"] } },
    );

    it.effect("come from the HCA", () =>
      Effect.gen(function* () {
        const chain = yield* Chain;
        const clients = yield* Clients;
        const { name, facts } = (yield* Fixtures).byId("v2.registered");
        const ens = clients.make({ account: facts["owner"] as Address });

        yield* chain.isolated(
          Effect.gen(function* () {
            yield* HcaActions.hca.deploySync(ens, {});
            const account = yield* HcaActions.hca.predictAddress(ens, {});
            assert.strictEqual(
              yield* revertName(Actions.name.transferSync(ens, { name, to: account })),
              "NoNFTAllowed",
            );
          }),
        );
      }),
    );
  });
});
