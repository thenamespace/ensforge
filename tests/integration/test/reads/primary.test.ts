import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { CoinType, Name } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import {
  concat,
  encodeAbiParameters,
  labelhash,
  namehash,
  parseAbi,
  stringToHex,
  toFunctionSelector,
  zeroAddress,
  type Address,
} from "viem";

import { Clients } from "../support/clients.ts";
import { Gateways } from "../support/gateways.ts";
import { onProfile } from "../support/lane.ts";

describe("primaryName.get", () => {
  // ENSv1 names verify through ENSv1 before the launch and through the ENSv1 bridge after it.
  for (const profile of ["v1-live", "mainnet-shaped"] as const) {
    onProfile(profile)(profile, (it) => {
      it.effect(
        "reads verified primary names from every reverse namespace and registrar generation",
        () =>
          Effect.gen(function* () {
            const fixtures = yield* Fixtures;
            const { reader } = yield* Clients;

            for (const [id, name] of Object.entries({
              "primary.addr-reverse": "rev-alice.eth",
              "primary.default-reverse": "rev-bob.eth",
              // `addr.reverse` takes priority over `default.reverse`.
              "primary.both": "rev-carol.eth",
              "primary.contract": "rev-contract.eth",
              "primary.reverse-2017": "rev-2017.eth",
              "primary.reverse-2020": "rev-2020.eth",
            })) {
              const address = String(fixtures.byId(id).facts["address"]);
              assert.strictEqual(yield* Actions.primaryName.get(reader, { address }), name, id);
              assert.isNull(yield* Actions.primaryName.get(reader, { address, coin: "base" }), id);
            }
          }),
        { meta: { cases: ["M:C3", "P01", "P05", "P22", "M:D10"] } },
      );

      it.effect(
        "returns null for names that do not verify, unless verification is off",
        () =>
          Effect.gen(function* () {
            const fixtures = yield* Fixtures;
            const { reader } = yield* Clients;
            const read = (id: string, verify?: boolean) => {
              const address = String(fixtures.byId(id).facts["address"]);
              return Actions.primaryName.get(
                reader,
                verify === undefined ? { address } : { address, verify },
              );
            };

            // The forward address belongs to someone else.
            assert.isNull(yield* read("primary.mismatch"));
            assert.strictEqual(yield* read("primary.mismatch", false), "v1-plain.eth");
            // Registered with a reverse record but no forward address.
            assert.isNull(yield* read("primary.at-registration"));
            assert.strictEqual(yield* read("primary.at-registration", false), "rev-registered.eth");
            // `Rev-Approved.eth` is never normalized into a primary name.
            assert.isNull(yield* read("primary.not-normalized"));
            assert.isNull(yield* read("primary.not-normalized", false));
          }),
        { meta: { cases: ["P07", "P08", "P26"] } },
      );

      // carol has both an `addr.reverse` name and a `default.reverse` one (`primary.both`).
      it.effect(
        "stops at an addr.reverse resolver without a name, never falling back to the default",
        () =>
          Effect.gen(function* () {
            const fixtures = yield* Fixtures;
            const devnet = yield* Devnet;
            const chain = yield* Chain;
            const { reader } = yield* Clients;
            const carol = devnet.accounts.carol;
            const setResolver = (resolver: Address) =>
              chain.write({
                address: devnet.contract("v1.registry"),
                abi: Abis.v1.ensRegistry,
                functionName: "setResolver",
                args: [namehash(`${carol.slice(2).toLowerCase()}.addr.reverse`), resolver],
                account: carol,
              });

            // Only a reverse node without a resolver falls back to `default.reverse`, and after
            // the launch not even that: the ENSv1 bridge stops at the node carol holds.
            yield* chain.isolated(
              Effect.gen(function* () {
                yield* setResolver(zeroAddress);
                assert.strictEqual(
                  yield* Actions.primaryName.get(reader, { address: carol }),
                  profile === "v1-live" ? "rev-carol-default.eth" : null,
                );
              }),
            );
            for (const [label, resolver] of [
              // The 2017 reverse resolver, which has no name for carol.
              ["ENSIP-3 resolver", devnet.contract("legacy.defaultReverseResolver2017")],
              ["reverting resolver", devnet.contract("mock.hostile.revert")],
              ["resolver without code", devnet.accounts.bob],
              ["resolver without name()", fixtures.byId("resolver.empty-answer").facts["resolver"]],
            ] as const) {
              yield* chain.isolated(
                Effect.gen(function* () {
                  yield* setResolver(resolver as Address);

                  assert.isNull(yield* Actions.primaryName.get(reader, { address: carol }), label);
                  yield* expectFailure(
                    Actions.primaryName.get(reader, { address: carol, strict: true }),
                    { _tag: "NotFoundError", code: "PRIMARY_NAME_NOT_SET" },
                  );
                }),
              );
            }
          }),
        { meta: { cases: ["P03", "P04", "P11"] } },
      );

      it.effect(
        "returns null for stored names that are not names, or whose resolver has no address",
        () =>
          Effect.gen(function* () {
            const fixtures = yield* Fixtures;
            const devnet = yield* Devnet;
            const chain = yield* Chain;
            const { reader } = yield* Clients;
            const carol = devnet.accounts.carol;

            const noAddr = fixtures.byId("resolver.empty-answer").name;

            // The stored bytes, and what an unverified read returns for them.
            for (const [stored, unverified] of [
              [stringToHex(noAddr), noAddr],
              [stringToHex(" "), null],
              // Not UTF-8: decoded with a replacement character, which no name contains.
              ["0xff2e657468", null],
            ] as const) {
              yield* chain.isolated(
                Effect.gen(function* () {
                  // `setName(string)` with raw bytes: the ABI encodes strings as bytes.
                  yield* chain.send({
                    account: carol,
                    chain: null,
                    to: devnet.contract("v1.reverseRegistrar"),
                    data: concat([
                      toFunctionSelector("setName(string)"),
                      encodeAbiParameters([{ type: "bytes" }], [stored]),
                    ]),
                  });

                  assert.isNull(yield* Actions.primaryName.get(reader, { address: carol }), stored);
                  assert.strictEqual(
                    yield* Actions.primaryName.get(reader, { address: carol, verify: false }),
                    unverified,
                  );
                }),
              );
            }
          }),
        { meta: { cases: ["P10", "P14", "P15"] } },
      );

      it.effect(
        "verifies a chain's primary name through the default EVM address alone",
        () =>
          Effect.gen(function* () {
            const devnet = yield* Devnet;
            const chain = yield* Chain;
            const bob = devnet.accounts.bob;
            const ens = (yield* Clients).make({ account: bob });

            yield* chain.isolated(
              Effect.gen(function* () {
                yield* Actions.record.setSync(ens, {
                  name: "rev-bob.eth",
                  addresses: { [String(CoinType.fromChainId(0))]: bob },
                });

                assert.strictEqual(
                  yield* Actions.primaryName.get(ens, { address: bob, coin: "base" }),
                  "rev-bob.eth",
                );
              }),
            );
          }),
        { meta: { cases: ["P09"] } },
      );

      it.effect(
        "verifies a primary name whose address is answered off-chain",
        () =>
          Effect.gen(function* () {
            const devnet = yield* Devnet;
            const chain = yield* Chain;
            const { reader } = yield* Clients;
            const gateways = yield* Gateways;
            const { name, facts } = (yield* Fixtures).byId("resolver.offchain");
            const gateway = yield* gateways.serve(() => ({ status: 200, body: '{"data":"0x"}' }));
            const alice = devnet.accounts.alice;

            yield* chain.isolated(
              Effect.gen(function* () {
                yield* chain.write({
                  address: facts["resolver"] as Address,
                  abi: parseAbi(["function setRevertURL(string)"]),
                  functionName: "setRevertURL",
                  args: [gateway.url],
                  account: devnet.accounts.deployer,
                });
                yield* chain.write({
                  address: devnet.contract("v1.reverseRegistrar"),
                  abi: Abis.v1.reverseRegistrar,
                  functionName: "setName",
                  args: [name],
                  account: alice,
                });

                assert.strictEqual(
                  yield* Actions.primaryName.get(reader, { address: alice }),
                  name,
                );
                assert.isAbove(gateway.requests(), 0);
              }),
            );
          }).pipe(Effect.scoped),
        { meta: { cases: ["P12"] } },
      );

      it.effect(
        "follows a primary name's subname as it is created and removed",
        () =>
          Effect.gen(function* () {
            const devnet = yield* Devnet;
            const chain = yield* Chain;
            const alice = devnet.accounts.alice;
            const ens = (yield* Clients).make({ account: alice });
            const name = "late.rev-alice.eth";
            const primary = Actions.primaryName.get(ens, { address: alice });

            yield* chain.isolated(
              Effect.gen(function* () {
                yield* Actions.primaryName.setSync(ens, { name, verify: false });
                assert.isNull(yield* primary);

                yield* Actions.subname.createSync(ens, {
                  name,
                  resolver: "parent",
                  records: { addresses: { eth: alice } },
                });
                assert.strictEqual(yield* primary, name);

                yield* Actions.subname.removeSync(ens, { name });
                assert.isNull(yield* primary);
              }),
            );
          }),
        { meta: { cases: ["P30"] } },
      );

      it.effect(
        "neither sets nor returns a primary name with an encoded label",
        () =>
          Effect.gen(function* () {
            const devnet = yield* Devnet;
            const chain = yield* Chain;
            const alice = devnet.accounts.alice;
            const ens = (yield* Clients).make({ account: alice });
            // `rev-alice.eth`, which resolves to alice, with its label known only by its hash.
            const encoded = `${Name.fromLabelhash(labelhash("rev-alice"))}.eth`;

            yield* expectFailure(Actions.primaryName.set.prepare(ens, { name: encoded }), {
              _tag: "InvalidInputError",
              code: "INVALID_NAME",
            });
            yield* chain.isolated(
              Effect.gen(function* () {
                yield* chain.write({
                  address: devnet.contract("v1.reverseRegistrar"),
                  abi: Abis.v1.reverseRegistrar,
                  functionName: "setName",
                  args: [encoded],
                  account: alice,
                });

                assert.isNull(yield* Actions.primaryName.get(ens, { address: alice }));
                assert.isNull(
                  yield* Actions.primaryName.get(ens, { address: alice, verify: false }),
                );
              }),
            );
          }),
        { meta: { cases: ["P16"] } },
      );
    });
  }
});
