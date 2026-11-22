import { assert, describe } from "@effect/vitest";
import {
  Effect,
  Formatter,
  Predicate,
  Record as Rec,
  String as Str,
  Array as Arr,
  pipe,
} from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { Actions as HcaActions } from "@ensforge/hca/effect";
import { Duration, Name } from "@ensforge/sdk";
import { Actions, type Errors } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { factAddress, Fixtures } from "@ensforge/test-fixtures";
import {
  bytesToHex,
  decodeErrorResult,
  encodeAbiParameters,
  encodeErrorResult,
  encodeFunctionData,
  encodePacked,
  erc20Abi,
  getAbiItem,
  hexToBigInt,
  keccak256,
  labelhash,
  maxUint64,
  namehash,
  numberToHex,
  pad,
  parseAbi,
  parseEther,
  toFunctionSelector,
  toHex,
  zeroAddress,
  zeroHash,
  isHex,
  type Abi,
  type Address,
  BaseError,
  type Hex,
} from "viem";
import { packetToBytes } from "viem/ens";

import { Clients } from "../support/clients.ts";
import { ethEntry } from "../support/contracts.ts";
import { RecordType, txtProof, type Tampering } from "../support/dnssec.ts";
import { Gateways } from "../support/gateways.ts";
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
  readonly value?: bigint;
};

/**
 * The name of the ENS error `call` reverts with. Errors the migration controllers return through
 * the NameWrapper arrive as `Error("WrappedError::0x…")` (`WrappedErrorLib`) and are unwrapped, as
 * ensforge does.
 */
const revertOf = Effect.fnUntraced(function* ({ from, to, abi, functionName, args, value }: Call) {
  const chain = yield* Chain;
  const data = encodeFunctionData({ abi, functionName, args });

  return yield* chain.call({ account: from, to, data, value }).pipe(
    Effect.match({
      onSuccess: () => "no revert",
      onFailure: (error) => {
        const reverted =
          error.cause instanceof BaseError
            ? error.cause.walk(
                (cause) => Predicate.hasProperty(cause, "data") && typeof cause.data === "string",
              )
            : null;
        const revertData = Predicate.hasProperty(reverted, "data") ? reverted.data : undefined;
        if (!isHex(revertData)) return "no revert data";

        const decoded = decodeErrorResult({ abi: Abis.shared.errors, data: revertData });
        const errorName: string = decoded.errorName;
        const [message] = decoded.args ?? [];
        const wrapped =
          typeof message === "string" && pipe(message, Str.startsWith("WrappedError::0x"))
            ? pipe(message, Str.slice("WrappedError::".length))
            : undefined;
        return errorName === "Error" && isHex(wrapped)
          ? decodeErrorResult({ abi: Abis.shared.errors, data: wrapped }).errorName
          : errorName;
      },
    }),
  );
});

/** `LibMigration.Data`, the migration controllers' input, for `name` and its new `owner`. */
const migration = (name: string, owner: Address) => ({
  label: Name.parse(name).label,
  owner,
  subregistry: zeroAddress,
  resolver: zeroAddress,
});

/** The contract error an ensforge call failed with, from its error context. */
const revertName = <A>(effect: Effect.Effect<A, Errors.AnyError>) =>
  effect.pipe(
    Effect.match({
      onSuccess: () => "no revert",
      onFailure: (error) => {
        const revert = Predicate.hasProperty(error.context, "revert")
          ? error.context.revert
          : undefined;
        return Predicate.hasProperty(revert, "errorName") && typeof revert.errorName === "string"
          ? revert.errorName
          : undefined;
      },
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
        const { alice, bob, carol, user } = devnet.accounts;
        const registeredName = fixtures.byId("v2.registered").name;
        const registered = (yield* ethEntry(registeredName)).tokenId;
        const delegated = (yield* ethEntry(fixtures.byId("v2.roles").name)).tokenId;
        const expired = (yield* ethEntry(fixtures.byId("v2.expired").name)).tokenId;

        // A child in a user registry: its expiry is set there, and never lowered.
        const child = Name.parse(fixtures.byId("v2.subnames").name);
        const subregistry = yield* Actions.registry.get(reader, {
          name: child.parent ?? assert.fail("a subname has a parent"),
        });
        if (subregistry === null) assert.fail(`${child.parent} has no registry`);
        const childToken = yield* chain.read({
          address: subregistry.address,
          abi: Abis.v2.permissionedRegistry,
          functionName: "findTokenId",
          args: [child.label],
        });

        const registry = {
          to: devnet.contract("v2.ethRegistry"),
          abi: Abis.v2.permissionedRegistry,
        };
        const childRegistry = { to: subregistry.address, abi: Abis.v2.permissionedRegistry as Abi };
        // `revived` is RESERVED in its registry: unregistered, then renewed by the root.
        const reserved = fixtures.byId("v2.unregistered.renewed");
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
            ...childRegistry,
            from: alice,
            functionName: "renew",
            args: [childToken, 1n],
          },
          CannotSetPastExpiry: {
            ...childRegistry,
            from: alice,
            functionName: "register",
            args: ["never-registered", alice, zeroAddress, zeroAddress, 0n, 1n],
          },
          // alice holds the child registry's root roles, so it is not emancipated.
          TransferUnsafeUntilRegistryIsEmancipated: {
            ...childRegistry,
            from: bob,
            functionName: "safeTransferFrom",
            args: [bob, carol, childToken, 1n, "0x"],
          },
          // Each role is one nybble's lowest bit; bit 1 is none.
          EACInvalidRoleBitmap: {
            ...registry,
            from: user,
            functionName: "getAssigneeCount",
            args: [registered, 2n],
          },
          LabelAlreadyRegistered: {
            ...registry,
            from: user,
            functionName: "register",
            args: [Name.parse(registeredName).label, user, zeroAddress, zeroAddress, 0n, maxUint64],
          },
          LabelAlreadyReserved: {
            to: factAddress(reserved.facts, "registry"),
            abi: Abis.v2.permissionedRegistry,
            from: alice,
            functionName: "register",
            args: [
              Name.parse(reserved.name).label,
              zeroAddress,
              zeroAddress,
              zeroAddress,
              0n,
              maxUint64,
            ],
          },
          Unauthorised: {
            ...wrapper,
            from: user,
            functionName: "setResolver",
            args: [namehash(fixtures.byId("v1.wrapped").name), stranger],
          },
          NameIsNotWrapped: {
            ...wrapper,
            from: alice,
            functionName: "extendExpiry",
            args: [
              namehash(fixtures.byId("v1.wrapped").name),
              keccak256(toHex("never-wrapped")),
              1n,
            ],
          },
          OperationProhibited: {
            ...wrapper,
            from: alice,
            functionName: "setTTL",
            args: [namehash(fixtures.byId("v1.wrapped.locked.cannot-set-ttl").name), 1n],
          },
        };

        for (const [error, call] of Rec.toEntries(cases)) {
          const revert = yield* revertOf(call);
          assert.strictEqual(revert, error);
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
            const revert = yield* revertOf({
              ...registry,
              from: alice,
              functionName: "grantRoles",
              args: [delegated, Roles.registry.setResolver, numberToHex(14, { size: 20 })],
            });
            assert.strictEqual(revert, "EACMaxAssignees");
          }),
        );

        // Upgrading the child's registry, on the current UserRegistry: the verifiable proxy wants
        // a target accepting it (the v1.0.1 implementation does not), the registry no upgrade
        // call that upgrades again. The target is a copy of the current implementation listing it
        // in `canUpgradeFrom`, a mapping at slot 1 of its own storage.
        const current = subregistry.implementation ?? assert.fail("the registry is a proxy");
        const target = "0x00000000000000000000000000000000000ce5e5";
        const upgrade = (implementation: Address, data: Hex): Call => ({
          to: subregistry.address,
          abi: Abis.v2.userRegistry,
          from: alice,
          functionName: "upgradeToAndCall",
          args: [implementation, data],
        });
        const invalidUpgradeRevert = yield* revertOf(
          upgrade(devnet.contract("v2.userRegistryImplementationV1_0_1"), "0x"),
        );
        assert.strictEqual(invalidUpgradeRevert, "InvalidUpgradeTarget");
        yield* chain.isolated(
          Effect.gen(function* () {
            yield* chain.setCode(target, (yield* chain.code(current)) ?? "0x");
            yield* chain.setStorage(
              target,
              keccak256(
                encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [current, 1n]),
              ),
              pad("0x01"),
            );
            const revert = yield* revertOf(
              upgrade(target, toFunctionSelector("upgradeToAndCall(address,bytes)")),
            );
            assert.strictEqual(revert, "NestedUpgradeNotAllowed");

            // A UserRegistry upgrades anywhere until it is emancipated; then only to the upgrade
            // set's implementations. alice keeps `upgrade`, which emancipation does not need.
            yield* chain.write({
              account: alice,
              address: subregistry.address,
              abi: Abis.v2.userRegistry,
              functionName: "revokeRootRoles",
              args: [Roles.registryBitmaps.unemancipated, alice],
            });
            const upgradeRevert = yield* revertOf(upgrade(target, "0x"));
            assert.strictEqual(upgradeRevert, "UpgradeTargetNotApproved");
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
          abi: Abis.v2.ethRegistrar,
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
        const v1Controller = {
          to: devnet.contract("v1.ethRegistrarController"),
          abi: Abis.v1.ethRegistrarController,
          from: alice,
        };

        const cases: Readonly<Record<string, Call>> = {
          NameNotRenewable: {
            ...registrar,
            from: alice,
            functionName: "getRenewPrice",
            args: ["never-registered", Duration.years(1), usdc],
          },
          NotValid: {
            to: devnet.contract("v2.rentPriceOracle"),
            abi: Abis.v2.standardRentPriceOracle,
            from: alice,
            functionName: "getRenewPrice",
            args: ["", 0n, Duration.years(1), usdc],
          },
          OwnableUnauthorizedAccount: {
            ...registrar,
            from: user,
            functionName: "transferOwnership",
            args: [user],
          },
          // ENSv1's controller checks the payment before anything else.
          InsufficientValue: {
            ...v1Controller,
            functionName: "renew",
            args: ["never-registered", Duration.years(1), zeroHash],
          },
          CommitmentNotFound: {
            ...v1Controller,
            functionName: "register",
            args: [
              {
                label: "never-committed",
                owner: alice,
                duration: Duration.years(1),
                secret,
                resolver: zeroAddress,
                data: [],
                reverseRecord: 0,
                referrer: zeroHash,
              },
            ],
            value: parseEther("1"),
          },
        };
        for (const [error, call] of Rec.toEntries(cases)) {
          const revert = yield* revertOf(call);
          assert.strictEqual(revert, error, error);
        }

        yield* chain.isolated(
          Effect.gen(function* () {
            const plain = yield* commit("qqqqq");
            yield* commit("rrrrr", 1n);
            yield* commit(taken);
            const revert = yield* revertOf({
              ...registrar,
              from: alice,
              functionName: "commit",
              args: [plain],
            });
            assert.strictEqual(revert, "UnexpiredCommitmentExists");
            const tooNewRevert = yield* revertOf(register(alice, "qqqqq"));
            assert.strictEqual(tooNewRevert, "CommitmentTooNew");

            yield* chain.increaseTime(120);
            yield* chain.mine();
            const allowanceRevert = yield* revertOf(register(user, "qqqqq"));
            assert.strictEqual(allowanceRevert, "ERC20InsufficientAllowance");
            yield* chain.write({
              address: usdc,
              abi: erc20Abi,
              functionName: "approve",
              args: [registrar.to, 10n ** 30n],
              account: user,
            });
            const balanceRevert = yield* revertOf(register(user, "qqqqq"));
            assert.strictEqual(balanceRevert, "ERC20InsufficientBalance");
            const unsupportedTokenRevert = yield* revertOf(
              register(alice, "qqqqq", { token: stranger }),
            );
            assert.strictEqual(unsupportedTokenRevert, "PaymentTokenNotSupported");
            const shortDurationRevert = yield* revertOf(register(alice, "rrrrr", { duration: 1n }));
            assert.strictEqual(shortDurationRevert, "DurationTooShort");
            const takenNameRevert = yield* revertOf(register(alice, taken));
            assert.strictEqual(takenNameRevert, "NameNotAvailable");

            yield* chain.increaseTime(Number(Duration.days(8)));
            yield* chain.mine();
            const tooOldRevert = yield* revertOf(register(alice, "qqqqq"));
            assert.strictEqual(tooOldRevert, "CommitmentTooOld");
          }),
        );
      }),
    );

    it.effect("come from the DNSSEC oracle and the DNS registrars", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const chain = yield* Chain;
        const { alice, bob } = devnet.accounts;
        const chainNow = yield* chain.now;
        const at = Number(chainNow);
        const name = "reverts-dns.com";
        const owner = [`a=${alice}`];
        const proof = (tampered: Tampering = {}, inception = at - 60) =>
          txtProof(name, owner, inception, tampered);
        const oracle = {
          to: devnet.contract("v1.dnssecOracle"),
          abi: Abis.v1.dnssecOracle,
          from: alice,
          functionName: "verifyRRSet",
        };
        const registrar = {
          to: devnet.contract("v1.dnsRegistrar"),
          abi: Abis.v1.dnsRegistrar,
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
          InvalidProofType: verify(
            Arr.filter([rootKeys, signed, signed], (set) => set !== undefined),
          ),
          NoOwnerRecordFound: claim(name, txtProof(name, ["v=spf1 -all"], at - 60)),
          InvalidPublicSuffix: claim(
            "reverts-dns.test",
            txtProof("reverts-dns.test", owner, at - 60),
          ),
          // The proof names alice as the owner.
          PermissionDenied: {
            ...registrar,
            from: bob,
            functionName: "proveAndClaimWithResolver",
            args: [bytesToHex(packetToBytes(name)), proof(), zeroAddress, zeroAddress],
          },
          TLDNotPublic: {
            to: devnet.contract("v2.temporaryDnsRegistrar"),
            abi: Abis.v2.temporaryDnsRegistrar,
            from: alice,
            functionName: "syncTLD",
            args: ["test"],
          },
        };
        for (const [error, call] of Rec.toEntries(cases)) {
          const revert = yield* revertOf(call);
          assert.strictEqual(revert, error, error);
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
            const revert = yield* revertOf(claim(name, proof({}, at - 3600)));
            assert.strictEqual(revert, "StaleProof");
          }),
        );
      }),
    );

    // The controllers' errors reach the caller through the NameWrapper as `WrappedError`s.
    it.effect(
      "come from the migration controllers and the migration helper",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const { alice, bob } = devnet.accounts;
          const plain = fixtures.byId("v1.wrapped").name;
          const locked = fixtures.byId("v1.wrapped.locked").name;
          const migrated = fixtures.byId("migration.locked").facts;
          const nameWrapper = devnet.contract("v1.nameWrapper");
          const sendTo = (controller: string, name: string): Call => ({
            to: nameWrapper,
            abi: Abis.v1.nameWrapper,
            from: alice,
            functionName: "safeTransferFrom",
            args: [
              alice,
              devnet.contract(controller),
              hexToBigInt(namehash(name)),
              1n,
              encodeAbiParameters(
                [
                  {
                    type: "tuple",
                    components: [
                      { name: "label", type: "string" },
                      { name: "owner", type: "address" },
                      { name: "subregistry", type: "address" },
                      { name: "resolver", type: "address" },
                    ],
                  },
                ],
                [migration(name, alice)],
              ),
            ],
          });
          // `migrate(unwrapped, unlockedGroups, lockedGroups, lockedChildrenGroups)`.
          const helper = (from: Address, groups: readonly unknown[]): Call => ({
            to: devnet.contract("v2.migrationHelper"),
            abi: Abis.v2.migrationHelper,
            from,
            functionName: "migrate",
            args: groups,
          });

          const cases: Readonly<Record<string, Call>> = {
            NameIsLocked: sendTo("v2.unlockedMigrationController", locked),
            NameNotLocked: sendTo("v2.lockedMigrationController", plain),
            // The parent migrated; its locked child did not, and only migration may claim it.
            NameRequiresMigration: {
              to: factAddress(migrated, "wrapperRegistry"),
              abi: Abis.v2.wrapperRegistry,
              from: alice,
              functionName: "register",
              args: [
                Name.parse(String(migrated["child"])).label,
                alice,
                zeroAddress,
                zeroAddress,
                0n,
                maxUint64,
              ],
            },
            NotApprovedOperator: helper(bob, [[], [[migration(plain, bob)]], [], []]),
            ParentNotMigrated: helper(alice, [
              [],
              [],
              [],
              [{ parentName: Name.dnsEncode(locked), groups: [] }],
            ]),
          };
          for (const [error, call] of Rec.toEntries(cases)) {
            const revert = yield* revertOf(call);
            assert.strictEqual(revert, error, error);
          }

          // One group moves one owner's names: bob lets alice move his, which is no reason to
          // mix them with hers.
          yield* chain.isolated(
            Effect.gen(function* () {
              yield* chain.write({
                account: alice,
                address: nameWrapper,
                abi: Abis.v1.nameWrapper,
                functionName: "safeTransferFrom",
                args: [alice, bob, hexToBigInt(namehash(plain)), 1n, "0x"],
              });
              yield* chain.write({
                account: bob,
                address: nameWrapper,
                abi: Abis.v1.nameWrapper,
                functionName: "setApprovalForAll",
                args: [alice, true],
              });
              const revert = yield* revertOf(
                helper(alice, [[], [[migration(locked, alice), migration(plain, alice)]], [], []]),
              );
              assert.strictEqual(revert, "WrappedOwnerMismatch");
            }),
          );
        }),
      { meta: { cases: ["M09", "M11"] } },
    );

    // `resolver.none` is premigrated: ENSv2 hands it to the ENSv1 bridge, which finds no ENSv1
    // resolver but `eth`'s, the ENSv2 bridge, which points back; the loop ends in UnreachableName.
    it.effect(
      "come from the Universal Resolver, through ensforge's reads",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const clients = yield* Clients;

          const unreachableRevert = yield* revertName(
            Actions.record.getText(clients.reader, {
              name: fixtures.byId("resolver.none").name,
              key: "url",
              strict: true,
            }),
          );
          assert.strictEqual(unreachableRevert, "UnreachableName");
          const resolverNotFoundRevert = yield* revertName(
            Actions.record.getText(clients.reader, {
              name: fixtures.byId("v2.registered").name,
              key: "url",
              strict: true,
            }),
          );
          assert.strictEqual(resolverNotFoundRevert, "ResolverNotFound");
          const offchainRevert = yield* revertName(
            Actions.record.getText(clients.make({ ccipRead: false }), {
              name: fixtures.byId("resolver.offchain").name,
              key: "url",
            }),
          );
          assert.strictEqual(offchainRevert, "OffchainLookup");
        }),
      { meta: { cases: ["O24"] } },
    );

    // `resolveWithResolver` and the reverse functions, with the batch gateways the test names: the
    // local one viem answers (`x-batch-gateway:true`) or an in-process one answering crafted batches.
    it.effect(
      "come from the Universal Resolver and its batch gateway",
      () =>
        Effect.gen(function* () {
          const fixtures = yield* Fixtures;
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const gateways = yield* Gateways;
          const { alice, bob, deployer } = devnet.accounts;
          const universalResolver = {
            to: devnet.contract("v2.universalResolver"),
            abi: Abis.v2.universalResolver,
            from: alice,
          };
          const offchain = fixtures.byId("resolver.offchain");
          const spoofed = fixtures.byId("resolver.spoofed-offchain-lookup");
          const shapeshift = {
            abi: parseAbi([
              "function setResponse(bytes,bytes)",
              "function setRevertURL(string)",
              "function setFeature(bytes4,bool)",
            ]),
            account: deployer,
          } as const;
          const resolveWith = (
            resolver: Address,
            name: string,
            batchGateways: readonly string[],
          ): Call => ({
            ...universalResolver,
            functionName: "resolveWithResolver",
            args: [
              resolver,
              Name.dnsEncode(name),
              encodeFunctionData({
                abi: Abis.shared.addrResolver,
                functionName: "addr",
                args: [namehash(name)],
              }),
              batchGateways,
            ],
          });
          // The batch gateway's answer, `abi.encode(bool[] failures, bytes[] responses)`.
          const batchGateway = (failures: readonly boolean[], responses: readonly Hex[]) =>
            gateways.serve(() => ({
              status: 200,
              body: Formatter.formatJson({
                data: encodeAbiParameters(
                  [{ type: "bool[]" }, { type: "bytes[]" }],
                  [failures, responses],
                ),
              }),
            }));
          const failing = yield* gateways.serve(() => ({
            status: 500,
            body: '{"message":"down"}',
          }));
          const miscounted = yield* batchGateway([true], []);
          // A failure whose error is neither `HttpError` nor `Error(string)`.
          const untrusted = yield* batchGateway([true], ["0x12345678"]);
          const notNormalized = fixtures.byId("primary.not-normalized").facts;

          const cases: Readonly<Record<string, Call>> = {
            UnsupportedResolverProfile: resolveWith(
              devnet.contract("mock.shapeshiftResolver"),
              offchain.name,
              [],
            ),
            ResolverNotContract: resolveWith(bob, offchain.name, []),
            InvalidBatchGatewayResponse: resolveWith(
              factAddress(offchain.facts, "resolver"),
              offchain.name,
              [miscounted.url],
            ),
            UnsafeBatchGatewayResponse: resolveWith(
              factAddress(offchain.facts, "resolver"),
              offchain.name,
              [untrusted.url],
            ),
          };
          for (const [error, call] of Rec.toEntries(cases)) {
            const revert = yield* revertOf(call);
            assert.strictEqual(revert, error, error);
          }
          assert.isAbove(miscounted.requests(), 0);
          assert.isAbove(untrusted.requests(), 0);

          yield* chain.isolated(
            Effect.gen(function* () {
              // viem's local batch gateway reports the resolver's failing gateway per request.
              yield* chain.write({
                ...shapeshift,
                address: factAddress(offchain.facts, "resolver"),
                functionName: "setRevertURL",
                args: [failing.url],
              });
              const revert = yield* revertOf(
                resolveWith(factAddress(offchain.facts, "resolver"), offchain.name, [
                  "x-batch-gateway:true",
                ]),
              );
              assert.strictEqual(revert, "HttpError");
              assert.isAbove(failing.requests(), 0);

              // bob claims alice's primary name, whose address is hers.
              yield* chain.write({
                account: bob,
                address: devnet.contract("v1.reverseRegistrar"),
                abi: Abis.v1.reverseRegistrar,
                functionName: "setName",
                args: [fixtures.byId("primary.addr-reverse").name],
              });
              const reverseMismatchRevert = yield* revertOf({
                ...universalResolver,
                functionName: "reverse",
                args: [bob, 60n],
              });
              assert.strictEqual(reverseMismatchRevert, "ReverseAddressMismatch");

              // An ERC-7996 resolver is called directly, without the batch gateway; a lookup it
              // raises in another contract's name ends the call there.
              yield* chain.write({
                ...shapeshift,
                address: factAddress(spoofed.facts, "resolver"),
                functionName: "setFeature",
                args: ["0x00000001", true],
              });
              const invalidOffchainLookupRevert = yield* revertOf(
                resolveWith(factAddress(spoofed.facts, "resolver"), spoofed.name, []),
              );
              assert.strictEqual(invalidOffchainLookupRevert, "InvalidOffchainLookup");

              // An ENSIP-15 normalizer: the mock answers `normalize(label)` with what is set.
              const normalizer = devnet.contract("mock.shapeshiftResolver");
              for (const [label, normalized] of [
                ["Rev-Approved", "rev-approved"],
                ["eth", "eth"],
              ] as const) {
                yield* chain.write({
                  ...shapeshift,
                  address: normalizer,
                  functionName: "setResponse",
                  args: [
                    encodeFunctionData({
                      abi: parseAbi(["function normalize(string) view returns (string)"]),
                      functionName: "normalize",
                      args: [label],
                    }),
                    encodeAbiParameters([{ type: "string" }], [normalized]),
                  ],
                });
              }
              const notNormalizedRevert = yield* revertOf({
                ...universalResolver,
                functionName: "reverseWithNormalization",
                args: [notNormalized["address"], 60n, normalizer],
              });
              assert.strictEqual(notNormalizedRevert, "PrimaryNameNotNormalized");
            }),
          );
        }).pipe(Effect.scoped),
      { meta: { cases: ["X01", "X05", "P07", "P08"] } },
    );

    // The L2 reverse resolvers' unruggable verifiers reject a gateway's proof of L2 state with
    // these errors. The devnet's L2 primary names (`8000000a.reverse`) are served by a resolver
    // whose gateway callback replays each, as a verifier would, back through the Universal
    // Resolver to ensforge.
    it.effect(
      "come from the L2 reverse resolvers' proof verifiers, through ensforge's reads",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const { reader } = yield* Clients;
          const gateways = yield* Gateways;
          const { owner, alice } = devnet.accounts;
          const offchain = (yield* Fixtures).byId("resolver.offchain");
          const resolver = {
            address: factAddress(offchain.facts, "resolver"),
            abi: parseAbi(["function setRevertURL(string)", "function setResponse(bytes,bytes)"]),
            account: owner,
          } as const;
          const gateway = yield* gateways.serve(() => ({ status: 200, body: '{"data":"0x"}' }));

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* chain.write({
                address: devnet.contract("v1.registry"),
                abi: Abis.v1.ensRegistry,
                functionName: "setSubnodeRecord",
                args: [namehash("reverse"), labelhash("8000000a"), owner, resolver.address, 0n],
                account: owner,
              });
              yield* chain.write({
                ...resolver,
                functionName: "setRevertURL",
                args: [gateway.url],
              });

              for (const [errorName, args] of [
                ["CommitTooOld", [10n, 2n, 4n]],
                ["CommitTooNew", [10n, 12n]],
                ["InvalidProof", []],
                ["GameNotFound", []],
                ["InvalidGameTypeBitMask", []],
                ["OutputNotFound", []],
                ["TooManyProofs", [8n]],
                ["RequestOverflow", []],
                ["InvalidRequest", []],
                ["InvalidStackIndex", [3n, 2n, false]],
                ["InvalidOutputIndex", [3n, 2n]],
                ["StackOverflow", []],
                ["DataMissing", []],
                ["DataIsNotMod32", []],
                ["LengthNotMod32", []],
                ["MaxTreeLeafIndexExceed", []],
                ["WrongBytesLength", [32n, 31n]],
                ["WrongProofLength", [4n, 3n]],
              ] as const) {
                yield* chain.write({
                  ...resolver,
                  functionName: "setResponse",
                  args: [
                    encodeFunctionData({
                      abi: Abis.shared.nameResolver,
                      functionName: "name",
                      args: [
                        namehash(`${Str.toLowerCase(pipe(alice, Str.slice(2)))}.8000000a.reverse`),
                      ],
                    }),
                    encodeErrorResult({ abi: Abis.shared.errors, errorName, args }),
                  ],
                });
                const verifierRevert = yield* revertName(
                  Actions.primaryName.get(reader, {
                    address: alice,
                    coin: { chainId: 10 },
                    strict: true,
                  }),
                );
                assert.strictEqual(verifierRevert, errorName);
              }
              assert.isAbove(gateway.requests(), 0);
            }),
          );
        }).pipe(Effect.scoped),
      { meta: { cases: ["P32"] } },
    );

    it.effect("come from the PermissionedResolver", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const { name, facts } = (yield* Fixtures).byId("records.v2.linked");

        // bob may link names on his resolver, but only to records it already has.
        const revert = yield* revertOf({
          to: factAddress(facts, "resolver"),
          abi: Abis.v2.permissionedResolver,
          from: devnet.accounts.bob,
          functionName: "linkToRecord",
          args: [Name.dnsEncode(name), 2n ** 64n],
        });
        assert.strictEqual(revert, "InvalidRecord");
      }),
    );

    // ERC-5559 and ERC-7884 refusals of a resolver that keeps its records off-chain.
    it.effect(
      "come from resolvers that keep their records off-chain",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const { alice } = devnet.accounts;
          const resolver = devnet.contract("mock.offchainWriter");
          const setText: Call = {
            from: alice,
            to: resolver,
            abi: Abis.v1.publicResolver,
            functionName: "setText",
            args: [zeroHash, "url", "x"],
          };

          yield* chain.isolated(
            Effect.gen(function* () {
              // `OffchainWriteResolver.Mode`.
              for (const [mode, error] of [
                [1, "StorageHandledByL2"],
                [2, "StorageHandledByOffChainDatabase"],
                [3, "OperationHandledOnchain"],
                [4, "OperationHandledOffchain"],
              ] as const) {
                yield* chain.write({
                  account: alice,
                  address: resolver,
                  abi: parseAbi(["function setMode(uint8)"]),
                  functionName: "setMode",
                  args: [mode],
                });
                const revert = yield* revertOf(setText);
                assert.strictEqual(revert, error);
              }
            }),
          );
        }),
      { meta: { cases: ["X16"] } },
    );

    it.effect("come from the ENSv2 reverse registrar adapter", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;

        // alice is neither LabelStore's Ownable owner nor its ContractNamer.
        const revert = yield* revertOf({
          from: devnet.accounts.alice,
          to: devnet.contract("v2.reverseRegistrarAdapter"),
          abi: Abis.v2.reverseRegistrarAdapter,
          functionName: "claim",
          args: [devnet.contract("v2.labelStore"), devnet.contract("v1.publicResolver")],
        });
        assert.strictEqual(revert, "UnauthorizedNamer");

        // The HCA entry points accept only an HCA the factory deployed, naming its own owner.
        const { alice, bob } = devnet.accounts;
        const clients = yield* Clients;
        const hcaOfAlice = yield* HcaActions.hca.predictAddress(
          clients.make({ account: alice }),
          {},
        );
        const claimWithHca = (from: Address, account: Address) =>
          revertOf({
            from,
            to: devnet.contract("v2.reverseRegistrarAdapter"),
            abi: Abis.v2.reverseRegistrarAdapter,
            functionName: "claimWithHCA",
            args: [account, zeroAddress],
          });
        const [untrusted, mismatched] = yield* Effect.all(
          [claimWithHca(bob, bob), claimWithHca(hcaOfAlice, bob)],
          { concurrency: 1 },
        );
        assert.deepStrictEqual(
          [untrusted, mismatched],
          ["HCADeploymentNotTrusted", "HCAOwnerMismatch"],
        );
      }),
    );

    // The ENSv1 reverse registrars check name claims signed by the account (`SignatureUtils`);
    // the devnet's copy of OP Mainnet's L2 reverse registrar also checks coin types and owners.
    it.effect(
      "come from the reverse registrars' signed name claims",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const { alice, bob, carol } = devnet.accounts;
          const now = yield* chain.now;
          const name = "claimed.eth";
          const registrar = {
            to: devnet.contract("v1.defaultReverseRegistrar"),
            abi: Abis.v1.defaultReverseRegistrar,
            from: carol,
            functionName: "setNameForAddrWithSignature",
          };
          const claim = Effect.fnUntraced(function* (expiry: bigint) {
            const selector = toFunctionSelector(
              getAbiItem({
                abi: Abis.v1.defaultReverseRegistrar,
                name: "setNameForAddrWithSignature",
              }),
            );
            const message = keccak256(
              encodePacked(
                ["address", "bytes4", "address", "uint256", "string"],
                [registrar.to, selector, alice, expiry, name],
              ),
            );
            return { ...registrar, args: [alice, expiry, name, yield* chain.sign(alice, message)] };
          });
          const l2Registrar = {
            to: devnet.contract("mock.l2ReverseRegistrar"),
            abi: Abis.v1.l2ReverseRegistrar,
            from: alice,
          };
          const anySignature = bytesToHex(new Uint8Array(65).fill(0x11));

          const cases: Readonly<Record<string, Call>> = {
            InvalidSignature: { ...registrar, args: [alice, now + 60n, name, anySignature] },
            SignatureExpired: yield* claim(now - 10n),
            SignatureExpiryTooHigh: yield* claim(now + 7200n),
            // Checked before the signature: Ethereum's coin type is not OP Mainnet's.
            CoinTypeNotFound: {
              ...l2Registrar,
              functionName: "setNameForAddrWithSignature",
              args: [alice, now + 60n, name, [60n], anySignature],
            },
            NotOwnerOfContract: {
              ...l2Registrar,
              functionName: "setNameForOwnableWithSignature",
              args: [devnet.contract("mock.ownable"), alice, now + 60n, name, [0x8000000an], "0x"],
            },
            Unauthorised: { ...l2Registrar, functionName: "setNameForAddr", args: [bob, name] },
          };
          for (const [error, call] of Rec.toEntries(cases)) {
            const revert = yield* revertOf(call);
            assert.strictEqual(revert, error, error);
          }
        }),
      { meta: { cases: ["P37", "P38"] } },
    );

    it.effect("come from the HCA", () =>
      Effect.gen(function* () {
        const chain = yield* Chain;
        const clients = yield* Clients;
        const { name, facts } = (yield* Fixtures).byId("v2.registered");
        const ens = clients.make({ account: factAddress(facts, "owner") });

        yield* chain.isolated(
          Effect.gen(function* () {
            yield* HcaActions.hca.deploySync(ens, {});
            const account = yield* HcaActions.hca.predictAddress(ens, {});
            const transferRevert = yield* revertName(
              Actions.name.transferSync(ens, { name, to: account }),
            );
            assert.strictEqual(transferRevert, "NoNFTAllowed");
          }),
        );
      }),
    );
  });
});
