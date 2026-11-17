import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { Devnet, type DevnetInstance } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import {
  bytesToHex,
  decodeErrorResult,
  encodeFunctionData,
  keccak256,
  namehash,
  toHex,
  zeroAddress,
  zeroHash,
  type Abi,
  type Address,
  type BaseError,
  type Hex,
} from "viem";
import { packetToBytes } from "viem/ens";

import { ensforge, isolated, onProfile } from "../support/chain.ts";
import { ownerText, RecordType, txtProof, type Tampering } from "../support/dnssec.ts";
import { ethEntry } from "./support.ts";

// Each contract error the SDK maps (`revertMap`) is raised here by a deployed contract, so the
// mapping matches what the contracts really revert with. `revert-map.test.ts` lists the rest.

const year = 31_536_000n;
const stranger = "0x000000000000000000000000000000000000dEaD";

type Call = {
  readonly from: Address;
  readonly to: Address;
  readonly abi: Abi;
  readonly functionName: string;
  readonly args: readonly unknown[];
};

/** The name of the ENS error `call` reverts with. */
const revertOf = (devnet: DevnetInstance, { from, to, abi, functionName, args }: Call) =>
  Effect.promise(() =>
    devnet.client
      .call({ account: from, to, data: encodeFunctionData({ abi, functionName, args } as never) })
      .then(
        () => "no revert",
        (error: BaseError) => {
          const reverted = error.walk(
            (cause) => typeof (cause as { data?: unknown }).data === "string",
          ) as { readonly data: Hex } | null;
          return reverted === null
            ? "no revert data"
            : decodeErrorResult({ abi: Abis.shared.errors, data: reverted.data }).errorName;
        },
      ),
  );

const write = (devnet: DevnetInstance, { from, to, abi, functionName, args }: Call) =>
  Effect.promise(async () => {
    const hash = await devnet.client.writeContract({
      account: from,
      chain: devnet.chain,
      address: to,
      abi,
      functionName,
      args,
    } as never);
    await devnet.client.waitForTransactionReceipt({ hash });
  });

/** The contract error an ensforge read failed with, from its error context. */
const revertName = (read: () => Promise<unknown>) =>
  Effect.promise(() =>
    read().then(
      () => "no revert",
      (error: { readonly context?: { readonly revert?: { readonly errorName?: string } } }) =>
        error.context?.revert?.errorName,
    ),
  );

describe("contract errors", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect("come from the registries and the NameWrapper", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const devnet = yield* Devnet;
        const { alice, carol, user } = devnet.accounts;
        const tokenOf = (id: string) =>
          Effect.map(
            ethEntry(devnet, fixtures.byId(id).name.slice(0, -".eth".length)),
            (entry) => entry.tokenId,
          );
        const registered = yield* tokenOf("v2.registered");
        const delegated = yield* tokenOf("v2.roles");
        const expired = yield* tokenOf("v2.expired");
        // A child in a user registry: its expiry is set there, and never lowered.
        const child = fixtures.byId("v2.subnames").name;
        const [childLabel = "", ...rest] = child.split(".");
        const subregistry = yield* Effect.promise(() =>
          ensforge(devnet).registry.get({ name: rest.join(".") }),
        );
        if (subregistry === null) return assert.fail(`${child} has no parent registry`);
        const childToken = yield* Effect.promise(
          () =>
            devnet.client.readContract({
              address: subregistry.address,
              abi: Abis.v2.permissionedRegistry,
              functionName: "findTokenId",
              args: [childLabel],
            }) as Promise<bigint>,
        );
        const registry = {
          to: devnet.contracts["v2.ethRegistry"] as Address,
          abi: Abis.v2.permissionedRegistry as Abi,
        };
        const wrapper = {
          to: devnet.contracts["v1.nameWrapper"] as Address,
          abi: Abis.v1.nameWrapper as Abi,
        };
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
          assert.strictEqual(yield* revertOf(devnet, call), error);
        }
      }),
    );

    it.effect("come from the ETH registrar and its payment token", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const devnet = yield* Devnet;
        const { alice, user } = devnet.accounts;
        const registrar = {
          to: devnet.contracts["v2.ethRegistrar"] as Address,
          abi: Abis.v2.ethRegistrar as Abi,
        };
        const usdc = devnet.contracts["v2.usdc"] as Address;
        const secret = keccak256(toHex("reverts"));
        const taken = fixtures.byId("v2.registered").name.slice(0, -".eth".length);
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
            options.duration ?? year,
            options.token ?? usdc,
            zeroHash,
          ],
        });
        const commitmentOf = (label: string, duration = year) =>
          Effect.promise(
            () =>
              devnet.client.readContract({
                ...registrar,
                address: registrar.to,
                functionName: "makeCommitment",
                args: [label, alice, secret, zeroAddress, zeroAddress, duration, zeroHash],
              }) as Promise<Hex>,
          );
        const commit = (commitment: Hex) =>
          write(devnet, { ...registrar, from: alice, functionName: "commit", args: [commitment] });

        yield* isolated(
          devnet,
          Effect.gen(function* () {
            const plain = yield* commitmentOf("qqqqq");
            yield* commit(plain);
            yield* commit(yield* commitmentOf("rrrrr", 1n));
            yield* commit(yield* commitmentOf(taken));
            assert.strictEqual(
              yield* revertOf(devnet, {
                ...registrar,
                from: alice,
                functionName: "commit",
                args: [plain],
              }),
              "UnexpiredCommitmentExists",
            );
            assert.strictEqual(
              yield* revertOf(devnet, register(alice, "qqqqq")),
              "CommitmentTooNew",
            );

            yield* Effect.promise(async () => {
              await devnet.client.increaseTime({ seconds: 120 });
              await devnet.client.mine({ blocks: 1 });
            });
            assert.strictEqual(
              yield* revertOf(devnet, register(user, "qqqqq")),
              "ERC20InsufficientAllowance",
            );
            yield* write(devnet, {
              from: user,
              to: usdc,
              abi: Abis.shared.erc20 as Abi,
              functionName: "approve",
              args: [registrar.to, 10n ** 30n],
            });
            assert.strictEqual(
              yield* revertOf(devnet, register(user, "qqqqq")),
              "ERC20InsufficientBalance",
            );
            assert.strictEqual(
              yield* revertOf(devnet, register(alice, "qqqqq", { token: stranger })),
              "PaymentTokenNotSupported",
            );
            assert.strictEqual(
              yield* revertOf(devnet, register(alice, "rrrrr", { duration: 1n })),
              "DurationTooShort",
            );
            assert.strictEqual(yield* revertOf(devnet, register(alice, taken)), "NameNotAvailable");

            yield* Effect.promise(async () => {
              await devnet.client.increaseTime({ seconds: 8 * 86_400 });
              await devnet.client.mine({ blocks: 1 });
            });
            assert.strictEqual(
              yield* revertOf(devnet, register(alice, "qqqqq")),
              "CommitmentTooOld",
            );
          }),
        );
      }),
    );

    it.effect("come from the DNSSEC oracle and the DNS registrars", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const { alice } = devnet.accounts;
        const at = Number((yield* Effect.promise(() => devnet.client.getBlock())).timestamp);
        const name = "reverts-dns.com";
        const owner = [ownerText(alice)];
        const proof = (tampered: Tampering = {}, inception = at - 60) =>
          txtProof(name, owner, inception, tampered);
        const oracle = {
          to: devnet.contracts["v1.dnssecOracle"] as Address,
          abi: Abis.v1.dnssecOracle as Abi,
          from: alice,
          functionName: "verifyRRSet",
        };
        const registrar = {
          to: devnet.contracts["v1.dnsRegistrar"] as Address,
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
            to: devnet.contracts["v2.temporaryDnsRegistrar"] as Address,
            abi: Abis.v2.temporaryDnsRegistrar as Abi,
            from: alice,
            functionName: "syncTLD",
            args: ["test"],
          },
        };
        for (const [error, call] of Object.entries(cases)) {
          assert.strictEqual(yield* revertOf(devnet, call), error, error);
        }

        // DNSRegistrar takes no proof older than the one it imported.
        yield* isolated(
          devnet,
          Effect.gen(function* () {
            yield* write(devnet, claim(name, proof()));
            assert.strictEqual(
              yield* revertOf(devnet, claim(name, proof({}, at - 3600))),
              "StaleProof",
            );
          }),
        );
      }),
    );

    it.effect("come from the Universal Resolver, through ensforge's reads", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const devnet = yield* Devnet;
        assert.strictEqual(
          yield* revertName(() =>
            ensforge(devnet).record.getText({
              name: fixtures.byId("resolver.none").name,
              key: "url",
              strict: true,
            }),
          ),
          "UnreachableName",
        );
        assert.strictEqual(
          yield* revertName(() =>
            ensforge(devnet, { ccipRead: false }).record.getText({
              name: fixtures.byId("resolver.offchain").name,
              key: "url",
            }),
          ),
          "OffchainLookup",
        );
      }),
    );
  });
});
