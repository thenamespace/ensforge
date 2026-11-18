import { Effect, String as Str } from "effect";

import type { StepContext } from "@ensforge/test-devnet";
import { labelhash, namehash, type Address } from "viem";

import { expectState } from "../builders/check.ts";
import { setV1Records } from "../builders/records.ts";
import { registerV1 } from "../builders/v1.ts";
import { factAddress, type Facts, type Fixture } from "../fixture.ts";
import { durations } from "./durations.ts";
import { coins } from "./values.ts";

/** A forward name `label.eth` whose ETH address is `address`. */
const forward = Effect.fnUntraced(function* (label: string, owner: Address, address: Address) {
  const name = yield* registerV1({ label, owner, duration: durations.active });
  yield* setV1Records({
    resolver: name.resolver,
    node: name.node,
    from: owner,
    records: { addresses: [[coins.eth, address]] },
  });
  return name.name;
});

// Reads the `addr.reverse` name of the fixture's `address` through whichever resolver its reverse
// node has (the registry falls back to the 2017 registry for nodes it never wrote).
const checkReverse = (id: string) => (c: StepContext, facts: Facts) =>
  Effect.gen(function* () {
    const address = factAddress(facts, "address");
    const node = namehash(`${Str.toLowerCase(Str.slice(2)(address))}.addr.reverse`);
    const resolver = yield* c.read<Address>("v1.registry", "resolver", [node]);
    const name = yield* c.read<string>([resolver, "v1/PublicResolver"], "name", [node]);
    yield* expectState(id, "addr.reverse name", name, facts["reverseName"]);
  });

/** Primary names through every reverse generation, plus mismatching and contract ones. */
export const primary: readonly Fixture[] = [
  {
    id: "primary.addr-reverse",
    cases: ["M:C3", "P02"],
    tags: { kind: "primary", reverse: "addr.reverse" },
    prelaunch: (c) =>
      Effect.gen(function* () {
        const name = yield* forward("rev-alice", c.accounts.alice, c.accounts.alice);
        yield* c.write("v1.reverseRegistrar", "setName", [name], { from: c.accounts.alice });
        return { name, address: c.accounts.alice, reverseName: name };
      }),
    check: checkReverse("primary.addr-reverse"),
  },
  {
    id: "primary.default-reverse",
    cases: ["M:C3", "P05", "P09"],
    tags: { kind: "primary", reverse: "default.reverse" },
    prelaunch: (c) =>
      Effect.gen(function* () {
        const name = yield* forward("rev-bob", c.accounts.bob, c.accounts.bob);
        yield* c.write("v1.defaultReverseRegistrar", "setName", [name], { from: c.accounts.bob });
        return { name, address: c.accounts.bob, defaultName: name };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const name = yield* c.read("v1.defaultReverseRegistrar", "nameForAddr", [c.accounts.bob]);
        yield* expectState(
          "primary.default-reverse",
          "default.reverse name",
          name,
          facts["defaultName"],
        );
      }),
  },
  {
    id: "primary.both",
    cases: ["P01"],
    tags: { kind: "primary", reverse: "both" },
    // `addr.reverse` takes priority over `default.reverse`.
    prelaunch: (c) =>
      Effect.gen(function* () {
        const name = yield* forward("rev-carol", c.accounts.carol, c.accounts.carol);
        const fallback = yield* forward("rev-carol-default", c.accounts.carol, c.accounts.carol);
        yield* c.write("v1.reverseRegistrar", "setName", [name], { from: c.accounts.carol });
        yield* c.write("v1.defaultReverseRegistrar", "setName", [fallback], {
          from: c.accounts.carol,
        });
        return { name, address: c.accounts.carol, reverseName: name, defaultName: fallback };
      }),
    check: checkReverse("primary.both"),
  },
  {
    id: "primary.mismatch",
    cases: ["P08"],
    tags: { kind: "primary", reverse: "addr.reverse", forward: "mismatch" },
    // The operator claims `v1-plain.eth`, whose address is alice's.
    prelaunch: (c) =>
      Effect.gen(function* () {
        yield* c.write("v1.reverseRegistrar", "setName", ["v1-plain.eth"], {
          from: c.accounts.operator,
        });
        return { name: "v1-plain.eth", address: c.accounts.operator, reverseName: "v1-plain.eth" };
      }),
    check: checkReverse("primary.mismatch"),
  },
  {
    id: "primary.not-normalized",
    cases: ["P07"],
    tags: { kind: "primary", reverse: "addr.reverse", forward: "not-normalized" },
    prelaunch: (c) =>
      Effect.gen(function* () {
        yield* forward("rev-approved", c.accounts.approved, c.accounts.approved);
        yield* c.write("v1.reverseRegistrar", "setName", ["Rev-Approved.eth"], {
          from: c.accounts.approved,
        });
        return {
          name: "rev-approved.eth",
          address: c.accounts.approved,
          reverseName: "Rev-Approved.eth",
        };
      }),
    check: checkReverse("primary.not-normalized"),
  },
  {
    id: "primary.contract",
    cases: ["P22", "M:D10"],
    tags: { kind: "primary", reverse: "addr.reverse", account: "ownable-contract" },
    // `user` owns the Ownable mock and names it.
    prelaunch: (c) =>
      Effect.gen(function* () {
        const contract = yield* c.address("mock.ownable");
        const name = yield* forward("rev-contract", c.accounts.user, contract);
        yield* c.write(
          "v1.reverseRegistrar",
          "setNameForAddr",
          [contract, c.accounts.user, yield* c.address("v1.publicResolver"), name],
          { from: c.accounts.user },
        );
        return { name, address: contract, reverseName: name };
      }),
    check: checkReverse("primary.contract"),
  },
  {
    id: "primary.reverse-2017",
    cases: ["M:C3", "P04", "P11"],
    tags: { kind: "primary", reverse: "2017" },
    // Claimed on the 2017 registry, whose `addr.reverse` the 2017 registrar owns; the current
    // registry falls back to it for this reverse node.
    prelaunch: (c) =>
      Effect.gen(function* () {
        const name = yield* forward("rev-2017", c.accounts.user2, c.accounts.user2);
        yield* c.write("legacy.reverseRegistrar2017", "setName", [name], {
          from: c.accounts.user2,
        });
        return { name, address: c.accounts.user2, reverseName: name };
      }),
    check: checkReverse("primary.reverse-2017"),
  },
  {
    id: "primary.reverse-2020",
    cases: ["M:C3"],
    tags: { kind: "primary", reverse: "2020" },
    // `reverse`'s owner hands `addr.reverse` back to the 2020 registrar for one claim, as it was
    // before 2023, then returns it.
    prelaunch: (c) =>
      Effect.gen(function* () {
        const name = yield* forward("rev-2020", c.accounts.user, c.accounts.user);
        const owner = { from: c.accounts.owner } as const;
        const setAddrReverse = (registrar: Address) =>
          c.write(
            "v1.registry",
            "setSubnodeOwner",
            [namehash("reverse"), labelhash("addr"), registrar],
            owner,
          );
        const legacyRegistrar = yield* c.address("legacy.reverseRegistrar2020");
        yield* setAddrReverse(legacyRegistrar);
        yield* c.write("legacy.reverseRegistrar2020", "setName", [name], { from: c.accounts.user });
        const currentRegistrar = yield* c.address("v1.reverseRegistrar");
        yield* setAddrReverse(currentRegistrar);
        return { name, address: c.accounts.user, reverseName: name };
      }),
    check: checkReverse("primary.reverse-2020"),
  },
  {
    id: "primary.at-registration",
    cases: ["P26"],
    tags: { kind: "primary", reverse: "addr.reverse", source: "registration" },
    prelaunch: (c) =>
      Effect.gen(function* () {
        const name = yield* registerV1({
          label: "rev-registered",
          owner: c.accounts.nameOwner,
          duration: durations.active,
          reverseRecord: 1,
        });
        return { name: name.name, address: c.accounts.nameOwner, reverseName: name.name };
      }),
    check: checkReverse("primary.at-registration"),
  },
];
