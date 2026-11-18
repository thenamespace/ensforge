import { Effect, String as Str } from "effect";

import { predictVerifiableProxyAddress } from "@ensforge/contracts/v2";
import { concatHex, namehash, type Address } from "viem";
import { mnemonicToAccount } from "viem/accounts";

import { expectState } from "../builders/check.ts";
import { factAddress, type Fixture } from "../fixture.ts";

/** Accounts acting on names other than as owners: operators, delegates, an HCA, a 7702 EOA. */
export const accounts: readonly Fixture[] = [
  {
    id: "account.v1-operator",
    cases: ["M:D4", "A01"],
    tags: { kind: "account", account: "v1-operator" },
    // The operator may act for alice on the registry and the registrar.
    prelaunch: (c) =>
      Effect.gen(function* () {
        const from = { from: c.accounts.alice } as const;
        yield* c.write("v1.registry", "setApprovalForAll", [c.accounts.operator, true], from);
        yield* c.write("v1.baseRegistrar", "setApprovalForAll", [c.accounts.operator, true], from);
        return { name: "v1-plain.eth", owner: c.accounts.alice, operator: c.accounts.operator };
      }),
    check: (c) =>
      Effect.gen(function* () {
        const approved = yield* c.read("v1.registry", "isApprovedForAll", [
          c.accounts.alice,
          c.accounts.operator,
        ]);
        yield* expectState("account.v1-operator", "registry operator", approved, true);
      }),
  },
  {
    id: "account.resolver-delegate",
    cases: ["M:D6", "A02"],
    tags: { kind: "account", account: "resolver-delegate" },
    // A per-name delegate on the PublicResolver, granted by the current owner.
    prelaunch: (c) =>
      Effect.gen(function* () {
        yield* c.write(
          "v1.publicResolver",
          "approve",
          [namehash("v1-plain.eth"), c.accounts.approved, true],
          { from: c.accounts.alice },
        );
        return { name: "v1-plain.eth", owner: c.accounts.alice, delegate: c.accounts.approved };
      }),
    check: (c) =>
      Effect.gen(function* () {
        const delegated = yield* c.read("v1.publicResolver", "isApprovedFor", [
          c.accounts.alice,
          namehash("v1-plain.eth"),
          c.accounts.approved,
        ]);
        yield* expectState("account.resolver-delegate", "delegate", delegated, true);
      }),
  },
  {
    id: "account.hca",
    cases: ["M:D9", "Z04"],
    tags: { kind: "account", account: "hca" },
    v2: true,
    // Alice's standalone HCA, deployed through the factory with the approved implementation.
    postlaunch: (c) =>
      Effect.gen(function* () {
        const implementation = yield* c.address("hca.standaloneImplementation");
        const factory = yield* c.address("hca.standaloneFactory");
        yield* c.write("hca.standaloneFactory", "deploy", [c.accounts.alice, implementation, 0n], {
          from: c.accounts.alice,
        });
        const salt = yield* c.read<bigint>("hca.standaloneFactory", "deploymentSalt", [
          c.accounts.alice,
          implementation,
          0n,
        ]);
        const hca = predictVerifiableProxyAddress({
          factory: yield* c.address("v2.verifiableFactory"),
          proxyLogic: yield* c.read<Address>("v2.verifiableFactory", "proxyLogic"),
          deployer: factory,
          salt,
        });
        return { name: "v1-plain.eth", owner: c.accounts.alice, hca };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const owner = yield* c.read("hca.standaloneFactory", "hcaOwners", [facts["hca"]]);
        yield* expectState("account.hca", "HCA owner", owner, c.accounts.alice);
      }),
  },
  {
    id: "account.eip7702",
    cases: ["A03"],
    tags: { kind: "account", account: "eip7702", cheat: "set-code" },
    // An EOA delegated (EIP-7702) to the ERC-1155 receiver mock, whose configuration lives in
    // storage the EOA does not have: whether it accepts tokens depends on the delegate (KL-20).
    prelaunch: (c) =>
      Effect.gen(function* () {
        const delegate = yield* c.address("mock.erc1155Receiver");
        // A fresh account (anvil mnemonic index 10), so no named account changes behaviour.
        const eoa = mnemonicToAccount(
          "test test test test test test test test test test test junk",
          { addressIndex: 10 },
        ).address;
        yield* c.cheat((client) =>
          client.setCode({ address: eoa, bytecode: concatHex(["0xef0100", delegate]) }),
        );
        return { name: "v1-plain.eth", account: eoa, delegate };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const code = yield* c.cheat((client) =>
          client.getCode({ address: factAddress(facts, "account") }),
        );
        yield* expectState(
          "account.eip7702",
          "delegated",
          code !== undefined && Str.startsWith("0xef0100")(code),
          true,
        );
      }),
  },
];
