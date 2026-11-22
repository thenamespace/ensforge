import { assert, describe } from "@effect/vitest";
import { Effect, String as Str, Record as Rec, pipe } from "effect";

import { Abis } from "@ensforge/contracts";
import { CoinType, Ensforge, Name } from "@ensforge/sdk";
import { Actions, Errors } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { factAddress, Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import {
  concat,
  encodeAbiParameters,
  encodeErrorResult,
  encodeFunctionData,
  http,
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

            for (const [id, name] of Rec.toEntries({
              "primary.addr-reverse": "rev-alice.eth",
              "primary.default-reverse": "rev-bob.eth",
              // `addr.reverse` takes priority over `default.reverse`.
              "primary.both": "rev-carol.eth",
              "primary.contract": "rev-contract.eth",
              "primary.reverse-2017": "rev-2017.eth",
              "primary.reverse-2020": "rev-2020.eth",
            })) {
              const address = String(fixtures.byId(id).facts["address"]);
              const defaultPrimaryName = yield* Actions.primaryName.get(reader, { address });
              assert.strictEqual(defaultPrimaryName, name, id);
              const basePrimaryName = yield* Actions.primaryName.get(reader, {
                address,
                coin: "base",
              });
              assert.isNull(basePrimaryName, id);
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
            const mismatched = yield* read("primary.mismatch");
            assert.isNull(mismatched);
            const mismatchedUnverified = yield* read("primary.mismatch", false);
            assert.strictEqual(mismatchedUnverified, "v1-plain.eth");
            // Registered with a reverse record but no forward address.
            const atRegistration = yield* read("primary.at-registration");
            assert.isNull(atRegistration);
            const atRegistrationUnverified = yield* read("primary.at-registration", false);
            assert.strictEqual(atRegistrationUnverified, "rev-registered.eth");
            // `Rev-Approved.eth` is never normalized into a primary name.
            const notNormalized = yield* read("primary.not-normalized");
            assert.isNull(notNormalized);
            const notNormalizedUnverified = yield* read("primary.not-normalized", false);
            assert.isNull(notNormalizedUnverified);
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
                args: [
                  namehash(`${Str.toLowerCase(pipe(carol, Str.slice(2)))}.addr.reverse`),
                  resolver,
                ],
                account: carol,
              });

            // Only a reverse node without a resolver falls back to `default.reverse`. After the
            // launch the fallback name does not verify: rev-carol-default.eth has no resolver
            // through ENSv2 resolution.
            yield* chain.isolated(
              Effect.gen(function* () {
                yield* setResolver(zeroAddress);
                const primaryNameAfterClear = yield* Actions.primaryName.get(reader, {
                  address: carol,
                });
                assert.strictEqual(
                  primaryNameAfterClear,
                  profile === "v1-live" ? "rev-carol-default.eth" : null,
                );
              }),
            );
            for (const [label, resolver] of [
              // The 2017 reverse resolver, which has no name for carol.
              ["ENSIP-3 resolver", devnet.contract("legacy.defaultReverseResolver2017")],
              ["reverting resolver", devnet.contract("mock.hostile.revert")],
              ["resolver without code", devnet.accounts.bob],
              [
                "resolver without name()",
                factAddress(fixtures.byId("resolver.empty-answer").facts, "resolver"),
              ],
            ] as const) {
              yield* chain.isolated(
                Effect.gen(function* () {
                  yield* setResolver(resolver);

                  const primaryNameUnderResolver = yield* Actions.primaryName.get(reader, {
                    address: carol,
                  });
                  assert.isNull(primaryNameUnderResolver, label);
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

                  const verifiedPrimaryName = yield* Actions.primaryName.get(reader, {
                    address: carol,
                  });
                  assert.isNull(verifiedPrimaryName, stored);
                  const unverifiedPrimaryName = yield* Actions.primaryName.get(reader, {
                    address: carol,
                    verify: false,
                  });
                  assert.strictEqual(unverifiedPrimaryName, unverified);
                }),
              );
            }
          }),
        { meta: { cases: ["P10", "P14", "P15"] } },
      );

      // The reverse side failing means no primary name (see above); the primary name's own
      // resolver failing means a name that does not resolve back. After the launch the ENSv1
      // bridge answers a missing `addr` with an empty revert, which names no profile.
      it.effect(
        "fails a primary name whose resolver is missing or has no address as a mismatch",
        () =>
          Effect.gen(function* () {
            const fixtures = yield* Fixtures;
            const devnet = yield* Devnet;
            const chain = yield* Chain;
            const { reader } = yield* Clients;
            const carol = devnet.accounts.carol;

            for (const [id, code] of [
              ["resolver.none", "PRIMARY_NAME_MISMATCH"],
              ["resolver.eoa", "PRIMARY_NAME_MISMATCH"],
              [
                "resolver.empty-answer",
                profile === "v1-live" ? "PRIMARY_NAME_MISMATCH" : "PRIMARY_NAME_NOT_SET",
              ],
            ] as const) {
              const { name } = fixtures.byId(id);
              yield* chain.isolated(
                Effect.gen(function* () {
                  yield* chain.write({
                    address: devnet.contract("v1.reverseRegistrar"),
                    abi: Abis.v1.reverseRegistrar,
                    functionName: "setName",
                    args: [name],
                    account: carol,
                  });

                  const primaryNameAfterSet = yield* Actions.primaryName.get(reader, {
                    address: carol,
                  });
                  assert.isNull(primaryNameAfterSet, id);
                  const error = yield* expectFailure(
                    Actions.primaryName.get(reader, { address: carol, strict: true }),
                    { _tag: "NotFoundError", code },
                  );
                  const cause = error.cause;
                  if (!Errors.is(cause)) assert.fail("the cause is not an ensforge error");
                  if (cause._tag === "NotFoundError") assert.strictEqual(cause.resource, name, id);
                  else if (code === "PRIMARY_NAME_MISMATCH") {
                    assert.strictEqual(cause.context.selector, "0x3b3b57de", id);
                  }
                }),
              );
            }
          }),
        { meta: { cases: ["P08", "P10"] } },
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

                const basePrimaryName = yield* Actions.primaryName.get(ens, {
                  address: bob,
                  coin: "base",
                });
                assert.strictEqual(basePrimaryName, "rev-bob.eth");
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
                  address: factAddress(facts, "resolver"),
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

                const primaryNameViaGateway = yield* Actions.primaryName.get(reader, {
                  address: alice,
                });
                assert.strictEqual(primaryNameViaGateway, name);
                assert.isAbove(gateway.requests(), 0);
              }),
            );
          }).pipe(Effect.scoped),
        { meta: { cases: ["P12"] } },
      );

      // An L2 primary name is read through an off-chain resolver on `<coin>.reverse`, whose gateway
      // proves L2 state that an unruggable verifier checks. The fixture's off-chain resolver
      // stands in for it, with its gateway failing each way a real one does.
      it.effect(
        "reports an L2 primary name's failing gateway or proof as a gateway error",
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
            const nameCall = encodeFunctionData({
              abi: Abis.shared.nameResolver,
              functionName: "name",
              args: [namehash(`${Str.toLowerCase(pipe(alice, Str.slice(2)))}.8000000a.reverse`)],
            });
            const failing = yield* gateways.serve(() => ({
              status: 500,
              body: '{"message":"down"}',
            }));
            const hanging = yield* gateways.hang;
            const answering = yield* gateways.serve(() => ({ status: 200, body: '{"data":"0x"}' }));
            const impatient = Ensforge.create({
              chain: devnet.chain,
              transports: { [devnet.chain.id]: http(devnet.rpcUrl, { timeout: 500 }) },
              publicRpc: false,
              deployment: devnet.deployments,
            });

            for (const [label, gateway, response, ens, code] of [
              [
                "HTTP 500",
                failing,
                encodeAbiParameters([{ type: "string" }], ["rev-alice.eth"]),
                reader,
                "GATEWAY_REQUEST_FAILED",
              ],
              [
                "no answer",
                hanging,
                encodeAbiParameters([{ type: "string" }], ["rev-alice.eth"]),
                impatient,
                "GATEWAY_REQUEST_FAILED",
              ],
              // The callback reverts as Base's verifier does for a proof it cannot check.
              [
                "proof rejected",
                answering,
                encodeErrorResult({ abi: Abis.shared.errors, errorName: "InvalidGameTypeBitMask" }),
                reader,
                "GATEWAY_RESPONSE_INVALID",
              ],
            ] as const) {
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
                  yield* chain.write({
                    ...resolver,
                    functionName: "setResponse",
                    args: [nameCall, response],
                  });

                  yield* expectFailure(
                    Actions.primaryName.get(ens, {
                      address: alice,
                      coin: { chainId: 10 },
                      strict: true,
                    }),
                    { _tag: "GatewayError", code },
                  );
                  assert.isAbove(gateway.requests(), 0, label);
                }),
              );
            }
          }).pipe(Effect.scoped),
        { meta: { cases: ["X01", "X12", "P32"] } },
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
                const primaryUnforwarded = yield* primary;
                assert.isNull(primaryUnforwarded);

                yield* Actions.subname.createSync(ens, {
                  name,
                  resolver: "parent",
                  records: { addresses: { eth: alice } },
                });
                const primaryAfterSubname = yield* primary;
                assert.strictEqual(primaryAfterSubname, name);

                yield* Actions.subname.removeSync(ens, { name });
                const primaryAfterRemoval = yield* primary;
                assert.isNull(primaryAfterRemoval);
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

                const verifiedPrimaryName = yield* Actions.primaryName.get(ens, { address: alice });
                assert.isNull(verifiedPrimaryName);
                const unverifiedPrimaryName = yield* Actions.primaryName.get(ens, {
                  address: alice,
                  verify: false,
                });
                assert.isNull(unverifiedPrimaryName);
              }),
            );
          }),
        { meta: { cases: ["P16"] } },
      );
    });
  }
});
