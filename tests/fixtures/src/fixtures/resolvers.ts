import { Effect } from "effect";
import type { FileSystem } from "effect";

import type { ArtifactError, DeployError, StepContext } from "@ensforge/test-devnet";
import {
  encodeAbiParameters,
  encodeErrorResult,
  encodeFunctionData,
  labelhash,
  namehash,
  parseAbi,
  toFunctionSelector,
  zeroAddress,
  zeroHash,
  type Address,
  type Hex,
} from "viem";

import { expectState } from "../builders/check.ts";
import { setV1Records } from "../builders/records.ts";
import { registerV1, v1Subname } from "../builders/v1.ts";
import { registerV2 } from "../builders/v2.ts";
import type { Fixture } from "../fixture.ts";
import { durations } from "./durations.ts";
import { coins } from "./values.ts";

const addrCall = (name: string): Hex =>
  encodeFunctionData({
    abi: parseAbi(["function addr(bytes32) view returns (address)"]),
    args: [namehash(name)],
  });
const addressAnswer = (address: Address): Hex =>
  encodeAbiParameters([{ type: "address" }], [address]);
const offchainLookup = parseAbi([
  "error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData)",
]);

type Built<A> = Effect.Effect<A, DeployError | ArtifactError, FileSystem.FileSystem>;
type Shapeshift = (c: StepContext, resolver: Address, name: string) => Built<unknown>;

/** A v1 name whose resolver is `resolver(c, name)` (deployed or chosen before registering). */
const bound = (
  id: string,
  label: string,
  cases: readonly string[],
  behaviour: string,
  resolver: (c: StepContext, name: string) => Built<Address>,
): Fixture => ({
  id,
  cases,
  tags: { kind: "v1-unwrapped", resolver: behaviour },
  prelaunch: (c) =>
    Effect.gen(function* () {
      const name = `${label}.eth`;
      const address = yield* resolver(c, name);
      yield* registerV1(c, {
        label,
        owner: c.accounts.alice,
        duration: durations.active,
        resolver: address,
      });
      return { name, resolver: address, owner: c.accounts.alice };
    }),
  check: (c, facts) =>
    Effect.gen(function* () {
      const actual = yield* c.read("v1.registry", "resolver", [namehash(String(facts["name"]))]);
      yield* expectState(id, "resolver", actual, facts["resolver"]);
    }),
});

/** A DummyShapeshiftResolver of its own, configured by `setup`. */
const shapeshift = (
  id: string,
  label: string,
  cases: readonly string[],
  behaviour: string,
  setup: Shapeshift,
): Fixture =>
  bound(id, label, cases, behaviour, (c, name) =>
    Effect.gen(function* () {
      const resolver = yield* c.deploy(`fixture.${id}`, "mocks/DummyShapeshiftResolver");
      yield* setup(c, resolver, name);
      return resolver;
    }),
  );

const configure = (
  c: StepContext,
  resolver: Address,
  functionName: string,
  args: readonly unknown[],
) => c.write([resolver, "mocks/DummyShapeshiftResolver"], functionName, args);

const ledgerAddress = (key: string) => (c: StepContext) => c.address(key);

/** Names bound to every resolver behaviour: generations, mocks and misbehaving contracts. */
export const resolvers: readonly Fixture[] = [
  bound("resolver.none", "rsv-none", ["M:B13"], "none", () => Effect.succeed(zeroAddress)),
  bound("resolver.eoa", "rsv-eoa", ["M:B14", "R05"], "eoa", (c) => Effect.succeed(c.accounts.bob)),
  bound("resolver.not-a-resolver", "rsv-wrapper", ["R06"], "not-a-resolver", (c) =>
    ledgerAddress("v1.nameWrapper")(c),
  ),
  bound("resolver.reverting", "rsv-reverting", ["M:B15", "R08"], "reverting", (c) =>
    ledgerAddress("mock.hostile.revert")(c),
  ),
  bound("resolver.gas-burner", "rsv-gas", ["R13"], "gas-burner", (c) =>
    ledgerAddress("mock.hostile.burnGas")(c),
  ),
  bound("resolver.returndata-bomb", "rsv-bomb", ["R14"], "returndata-bomb", (c) =>
    ledgerAddress("mock.hostile.returnLarge")(c),
  ),
  {
    ...bound(
      "resolver.public-resolver-v2.unknown",
      "rsv-prv2",
      ["M:B4", "R26"],
      "public-resolver-v2",
      (c) => ledgerAddress("v2.publicResolver")(c),
    ),
    v2: true,
  },
  shapeshift("resolver.no-erc165", "rsv-old", ["R11", "M:B2"], "no-erc165", (c, resolver, name) =>
    Effect.gen(function* () {
      yield* configure(c, resolver, "setOld", [true]);
      yield* configure(c, resolver, "setResponse", [
        addrCall(name),
        addressAnswer(c.accounts.alice),
      ]);
    }),
  ),
  // No answer configured: `addr` returns empty data.
  shapeshift(
    "resolver.empty-answer",
    "rsv-empty",
    ["R07", "M:B17"],
    "empty-answer",
    () => Effect.void,
  ),
  // An answer that is not a multiple of 32 bytes, which the mock raises as revert data.
  shapeshift(
    "resolver.malformed-answer",
    "rsv-malformed",
    ["R15", "M:B17"],
    "malformed-answer",
    (c, resolver, name) => configure(c, resolver, "setResponse", [addrCall(name), "0x123456"]),
  ),
  shapeshift(
    "resolver.unsupported-profile",
    "rsv-unsupported",
    ["R09"],
    "unsupported-profile",
    (c, resolver) =>
      Effect.gen(function* () {
        yield* configure(c, resolver, "setExtended", [true]);
        yield* configure(c, resolver, "setRevertUnsupportedResolverProfile", [true]);
      }),
  ),
  shapeshift("resolver.offchain", "rsv-offchain", ["M:B10"], "offchain", (c, resolver, name) =>
    Effect.gen(function* () {
      yield* configure(c, resolver, "setExtended", [true]);
      yield* configure(c, resolver, "setOffchain", [true]);
      yield* configure(c, resolver, "setResponse", [
        addrCall(name),
        addressAnswer(c.accounts.alice),
      ]);
    }),
  ),
  shapeshift(
    "resolver.spoofed-offchain-lookup",
    "rsv-spoofed",
    ["M:B12"],
    "spoofed-offchain-lookup",
    (c, resolver, name) =>
      Effect.gen(function* () {
        yield* configure(c, resolver, "setExtended", [true]);
        const spoofed = encodeErrorResult({
          abi: offchainLookup,
          errorName: "OffchainLookup",
          args: [c.accounts.bob, ['data:application/json,{"data":"0x"}'], "0x", "0x00000000", "0x"],
        });
        yield* configure(c, resolver, "setResponse", [addrCall(name), spoofed]);
      }),
  ),
  {
    // ENSIP-10: the parent's extended resolver answers for `child.rsv-wildcard.eth`, which has no
    // registry record; `exact.rsv-wildcard.eth` has its own resolver, which wins.
    ...shapeshift(
      "resolver.wildcard",
      "rsv-wildcard",
      ["M:B9", "R01", "R03", "R04", "H25"],
      "wildcard",
      (c, resolver) =>
        Effect.gen(function* () {
          yield* configure(c, resolver, "setExtended", [true]);
          yield* configure(c, resolver, "setResponse", [
            addrCall("child.rsv-wildcard.eth"),
            addressAnswer(c.accounts.bob),
          ]);
        }),
    ),
    postlaunch: (c) =>
      Effect.gen(function* () {
        const exact = yield* v1Subname(c, {
          parent: "rsv-wildcard.eth",
          label: "exact",
          parentOwner: c.accounts.alice,
          owner: c.accounts.alice,
        });
        yield* setV1Records(c, {
          resolver: exact.resolver,
          node: exact.node,
          from: c.accounts.alice,
          records: { addresses: [[coins.eth, c.accounts.carol]] },
        });
        return {
          wildcardChild: "child.rsv-wildcard.eth",
          wildcardAddress: c.accounts.bob,
          exact: exact.name,
        };
      }),
  },
  {
    id: "resolver.frozen-2019",
    cases: ["M:B2", "R12"],
    tags: { kind: "v1-unwrapped", resolver: "frozen-2019" },
    // A `.eth` name pointing at the 2019 resolver, whose records only the old registry's owner
    // of the same node could write (as on mainnet before the 2020 migration).
    prelaunch: (c) =>
      Effect.gen(function* () {
        const resolver = yield* c.address("legacy.publicResolver2019");
        const root = { from: c.accounts.owner } as const;
        const ethOnOld = yield* c.read<Address>("v1.legacyRegistry", "owner", [namehash("eth")]);
        if (ethOnOld === zeroAddress) {
          yield* c.write(
            "v1.legacyRegistry",
            "setSubnodeOwner",
            [zeroHash, labelhash("eth"), c.accounts.owner],
            root,
          );
        }
        yield* c.write(
          "v1.legacyRegistry",
          "setSubnodeOwner",
          [namehash("eth"), labelhash("rsv-2019"), c.accounts.alice],
          root,
        );
        const name = yield* registerV1(c, {
          label: "rsv-2019",
          owner: c.accounts.alice,
          duration: durations.active,
          resolver,
        });
        yield* setV1Records(c, {
          resolver,
          node: name.node,
          from: c.accounts.alice,
          records: {
            addresses: [[coins.eth, c.accounts.alice]],
            texts: { url: "https://2019.example" },
          },
        });
        return { name: name.name, resolver, owner: c.accounts.alice };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const url = yield* c.read([facts["resolver"] as Address, "v1/PublicResolver"], "text", [
          namehash(String(facts["name"])),
          "url",
        ]);
        yield* expectState("resolver.frozen-2019", "url", url, "https://2019.example");
      }),
  },
  {
    id: "resolver.2020",
    cases: ["M:B2", "R12"],
    tags: { kind: "v1-unwrapped", resolver: "public-resolver-2020" },
    prelaunch: (c) =>
      Effect.gen(function* () {
        const resolver = yield* c.address("legacy.publicResolver2020Feb");
        const name = yield* registerV1(c, {
          label: "rsv-2020",
          owner: c.accounts.alice,
          duration: durations.active,
          resolver,
        });
        yield* setV1Records(c, {
          resolver,
          node: name.node,
          from: c.accounts.alice,
          records: {
            addresses: [[coins.eth, c.accounts.alice]],
            texts: { url: "https://2020.example" },
          },
        });
        return { name: name.name, resolver, owner: c.accounts.alice };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const url = yield* c.read([facts["resolver"] as Address, "v1/PublicResolver"], "text", [
          namehash(String(facts["name"])),
          "url",
        ]);
        yield* expectState("resolver.2020", "url", url, "https://2020.example");
      }),
  },
  {
    id: "resolver.registry-reverts",
    cases: ["M:B16", "R19", "R20"],
    tags: { kind: "v2-native", resolver: "registry-reverts" },
    v2: true,
    // `x.rsv-badregistry.eth` resolves through a subregistry whose `getResolver` reverts with an
    // OffchainLookup it did not expect (mainnet wraps it in ResolutionError).
    postlaunch: (c) =>
      Effect.gen(function* () {
        const name = yield* registerV2(c, {
          label: "rsv-badregistry",
          owner: c.accounts.alice,
          duration: durations.active,
        });
        const registry = yield* c.deploy(
          "fixture.resolver.registry-reverts",
          "mocks/MockRevertingRegistry",
        );
        yield* c.write(
          [yield* c.address("v2.ethRegistry"), "v2/ETHRegistry"],
          "setSubregistry",
          [name.tokenId, registry],
          {
            from: c.accounts.alice,
          },
        );
        const revert = encodeErrorResult({
          abi: offchainLookup,
          errorName: "OffchainLookup",
          args: [registry, ["https://ensforge.invalid/"], "0x", "0x00000000", "0x"],
        });
        yield* c.write([registry, "mocks/MockRevertingRegistry"], "setRevertData", [
          toFunctionSelector("getResolver(string)"),
          revert,
        ]);
        return { name: `x.${name.name}`, registry };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const mounted = yield* c.read(
          [yield* c.address("v2.ethRegistry"), "v2/ETHRegistry"],
          "getSubregistry",
          ["rsv-badregistry"],
        );
        yield* expectState("resolver.registry-reverts", "subregistry", mounted, facts["registry"]);
      }),
  },
];
