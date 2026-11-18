import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { assert, describe } from "@effect/vitest";
import { Deferred, Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { Ensforge } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import {
  concatBytes,
  createPublicClient,
  encodeAbiParameters,
  encodeErrorResult,
  encodeFunctionData,
  http,
  namehash,
  pad,
  parseAbi,
  toBytes,
  toHex,
  type Address,
} from "viem";

import { Clients } from "../support/clients.ts";
import { txtProof } from "../support/dnssec.ts";
import { Gateways } from "../support/gateways.ts";
import { onProfile } from "../support/lane.ts";

// The fixture resolvers answer `addr(bytes32)` through CCIP-Read. Their mocks point at `data:`
// URLs, which viem does not follow, so each test points them at an in-process gateway first.

describe("CCIP-Read", () => {
  for (const profile of ["v1-live", "mainnet-shaped"] as const) {
    onProfile(profile)(profile, (it) => {
      it.effect(
        "never answers from an off-chain lookup that names another contract as its sender",
        () =>
          Effect.gen(function* () {
            const devnet = yield* Devnet;
            const chain = yield* Chain;
            const { reader } = yield* Clients;
            const gateways = yield* Gateways;
            const { name, facts } = (yield* Fixtures).byId("resolver.spoofed-offchain-lookup");
            const gateway = yield* gateways.serve(() => ({ status: 200, body: '{"data":"0x"}' }));
            const data = encodeFunctionData({
              abi: Abis.shared.addrResolver,
              functionName: "addr",
              args: [namehash(name)],
            });

            yield* chain.isolated(
              Effect.gen(function* () {
                const lookup = encodeErrorResult({
                  abi: Abis.shared.errors,
                  errorName: "OffchainLookup",
                  args: [devnet.accounts.bob, [gateway.url], "0x", "0x00000000", "0x"],
                });
                yield* chain.write({
                  address: facts["resolver"] as Address,
                  abi: parseAbi(["function setResponse(bytes,bytes)"]),
                  functionName: "setResponse",
                  args: [data, lookup],
                  account: devnet.accounts.deployer,
                });

                // The Universal Resolver's batcher follows it and calls back the named sender, an
                // account here, which answers nothing: a typed error, never the gateway's data.
                yield* expectFailure(Actions.resolver.resolve(reader, { name, data }), {
                  _tag: "UnsupportedError",
                  code: "RESOLVER_PROFILE_UNSUPPORTED",
                });
              }),
            );
          }).pipe(Effect.scoped),
        { meta: { cases: ["M:B12", "X05"] } },
      );

      it.effect(
        "follows an off-chain lookup through the resolver's gateway",
        () =>
          Effect.gen(function* () {
            const devnet = yield* Devnet;
            const chain = yield* Chain;
            const { reader } = yield* Clients;
            const gateways = yield* Gateways;
            const { name, facts } = (yield* Fixtures).byId("resolver.offchain");
            const gateway = yield* gateways.serve(() => ({ status: 200, body: '{"data":"0x"}' }));
            const data = encodeFunctionData({
              abi: Abis.shared.addrResolver,
              functionName: "addr",
              args: [namehash(name)],
            });

            yield* chain.isolated(
              Effect.gen(function* () {
                yield* chain.write({
                  address: facts["resolver"] as Address,
                  abi: parseAbi(["function setRevertURL(string)"]),
                  functionName: "setRevertURL",
                  args: [gateway.url],
                  account: devnet.accounts.deployer,
                });

                const resolved = yield* Actions.resolver.resolve(reader, { name, data });
                assert.strictEqual(
                  resolved.data,
                  encodeAbiParameters([{ type: "address" }], [devnet.accounts.alice]),
                );
                assert.isAbove(gateway.requests(), 0);
              }),
            );
          }).pipe(Effect.scoped),
        { meta: { cases: ["M:B10", "R32"] } },
      );

      // ensforge reads several records as one `resolve(name, multicall(calls))`. A resolver that
      // declares ERC-7996 `eth.ens.resolver.extended.multicall` answers it at once; the Universal
      // Resolver splits it into one lookup per call through the batch gateway otherwise.
      it.effect(
        "keeps the records that answer when another call of the read fails",
        () =>
          Effect.gen(function* () {
            const devnet = yield* Devnet;
            const chain = yield* Chain;
            const { reader } = yield* Clients;
            const gateways = yield* Gateways;
            const { name, facts } = (yield* Fixtures).byId("resolver.offchain");
            const gateway = yield* gateways.serve(() => ({ status: 200, body: '{"data":"0x"}' }));
            const resolver = {
              address: facts["resolver"] as Address,
              abi: parseAbi([
                "function setResponse(bytes,bytes)",
                "function setRevertURL(string)",
                "function setFeature(bytes4,bool)",
                "function setDeriveMulticall(bool)",
              ]),
              account: devnet.accounts.deployer,
            } as const;
            const textCall = (key: string) =>
              encodeFunctionData({
                abi: Abis.shared.textResolver,
                functionName: "text",
                args: [namehash(name), key],
              });

            for (const multicall of [false, true]) {
              yield* chain.isolated(
                Effect.gen(function* () {
                  yield* chain.write({
                    ...resolver,
                    functionName: "setRevertURL",
                    args: [gateway.url],
                  });
                  yield* chain.write({
                    ...resolver,
                    functionName: "setResponse",
                    args: [
                      textCall("url"),
                      encodeAbiParameters([{ type: "string" }], ["https://ok.example"]),
                    ],
                  });
                  // A revert's data is not 32-byte aligned: the entry is an error, not a value.
                  yield* chain.write({
                    ...resolver,
                    functionName: "setResponse",
                    args: [
                      textCall("description"),
                      encodeErrorResult({ abi: parseAbi(["error Down()"]), errorName: "Down" }),
                    ],
                  });
                  if (multicall) {
                    yield* chain.write({
                      ...resolver,
                      functionName: "setFeature",
                      // bytes4(keccak256("eth.ens.resolver.extended.multicall"))
                      args: ["0x96b62db8", true],
                    });
                    yield* chain.write({
                      ...resolver,
                      functionName: "setDeriveMulticall",
                      args: [true],
                    });
                  }

                  const records = yield* Actions.record.get(reader, {
                    name,
                    texts: ["url", "description"],
                  });
                  assert.deepStrictEqual(
                    records.texts,
                    { url: "https://ok.example", description: null },
                    `multicall: ${multicall}`,
                  );
                  assert.isAbove(gateway.requests(), 0);
                }),
              );
            }
          }).pipe(Effect.scoped),
        { meta: { cases: ["R10", "R30", "X10"] } },
      );

      it.effect(
        "does not contact the gateway when CCIP-Read is disabled",
        () =>
          Effect.gen(function* () {
            const devnet = yield* Devnet;
            const chain = yield* Chain;
            const clients = yield* Clients;
            const gateways = yield* Gateways;
            const { name, facts } = (yield* Fixtures).byId("resolver.offchain");
            const gateway = yield* gateways.serve(() => ({ status: 200, body: '{"data":"0x"}' }));
            const data = encodeFunctionData({
              abi: Abis.shared.addrResolver,
              functionName: "addr",
              args: [namehash(name)],
            });

            yield* chain.isolated(
              Effect.gen(function* () {
                yield* chain.write({
                  address: facts["resolver"] as Address,
                  abi: parseAbi(["function setRevertURL(string)"]),
                  functionName: "setRevertURL",
                  args: [gateway.url],
                  account: devnet.accounts.deployer,
                });

                const ens = clients.make({ ccipRead: false });
                yield* expectFailure(Actions.resolver.resolve(ens, { name, data }), {
                  _tag: "ConfigError",
                  code: "CCIP_READ_DISABLED",
                });
                assert.strictEqual(gateway.requests(), 0);
              }),
            );
          }).pipe(Effect.scoped),
        { meta: { cases: ["X13", "M:F4"] } },
      );

      it.effect(
        "reports a failing gateway with its HTTP status",
        () =>
          Effect.gen(function* () {
            const devnet = yield* Devnet;
            const chain = yield* Chain;
            const { reader } = yield* Clients;
            const gateways = yield* Gateways;
            const { name, facts } = (yield* Fixtures).byId("resolver.offchain");
            const gateway = yield* gateways.serve(() => ({
              status: 500,
              body: '{"message":"down"}',
            }));
            const data = encodeFunctionData({
              abi: Abis.shared.addrResolver,
              functionName: "addr",
              args: [namehash(name)],
            });

            yield* chain.isolated(
              Effect.gen(function* () {
                yield* chain.write({
                  address: facts["resolver"] as Address,
                  abi: parseAbi(["function setRevertURL(string)"]),
                  functionName: "setRevertURL",
                  args: [gateway.url],
                  account: devnet.accounts.deployer,
                });

                const error = yield* expectFailure(
                  Actions.resolver.resolve(reader, { name, data }),
                  {
                    _tag: "GatewayError",
                    code: "GATEWAY_REQUEST_FAILED",
                  },
                );
                assert.strictEqual(error.status, 500);
              }),
            );
          }).pipe(Effect.scoped),
        { meta: { cases: ["M:B11", "X01"] } },
      );

      it.effect(
        "fails with the resolver's error when it rejects the gateway's answer",
        () =>
          Effect.gen(function* () {
            const devnet = yield* Devnet;
            const chain = yield* Chain;
            const { reader } = yield* Clients;
            const gateways = yield* Gateways;
            const { name, facts } = (yield* Fixtures).byId("resolver.offchain");
            const gateway = yield* gateways.serve(() => ({ status: 200, body: '{"data":"0x"}' }));
            const data = encodeFunctionData({
              abi: Abis.shared.addrResolver,
              functionName: "addr",
              args: [namehash(name)],
            });
            const abi = parseAbi([
              "function setRevertURL(string)",
              "function setResponse(bytes,bytes)",
            ]);

            yield* chain.isolated(
              Effect.gen(function* () {
                const account = devnet.accounts.deployer;
                const address = facts["resolver"] as Address;
                yield* chain.write({
                  address,
                  abi,
                  functionName: "setRevertURL",
                  args: [gateway.url],
                  account,
                });
                // The callback reverts as ENS's signed OffchainResolver does for a bad signature.
                yield* chain.write({
                  address,
                  abi,
                  functionName: "setResponse",
                  args: [
                    data,
                    encodeErrorResult({
                      abi: parseAbi(["error Error(string)"]),
                      errorName: "Error",
                      args: ["SignatureVerifier: Invalid signature"],
                    }),
                  ],
                  account,
                });

                const error = yield* expectFailure(
                  Actions.resolver.resolve(reader, { name, data }),
                  { _tag: "ContractRevertError", code: "CONTRACT_REVERTED" },
                );
                assert.deepStrictEqual(error.args, ["SignatureVerifier: Invalid signature"]);
                assert.isAbove(gateway.requests(), 0);
              }),
            );
          }).pipe(Effect.scoped),
        { meta: { cases: ["X14"] } },
      );

      // `signal` is a Promise-only option, so the abort goes through the Promise API.
      it.effect(
        "times out on a gateway that never answers, and an abort drops its request",
        () =>
          Effect.gen(function* () {
            const devnet = yield* Devnet;
            const chain = yield* Chain;
            const { reader } = yield* Clients;
            const { name, facts } = (yield* Fixtures).byId("resolver.offchain");
            const data = encodeFunctionData({
              abi: Abis.shared.addrResolver,
              functionName: "addr",
              args: [namehash(name)],
            });
            // The caller's own signal: the Promise API is what is under test.
            // @effect-diagnostics-next-line abortControllerInEffect:off
            const controller = new AbortController();
            const reason = new Error("left the page");
            // A gateway that never answers: the first request aborts the caller's signal, and
            // `dropped` completes when the client closes that request.
            const dropped = yield* Deferred.make<void>();
            const gateway = yield* Effect.acquireRelease(
              Effect.callback<Server>((resume) => {
                const server = createServer((request, response) => {
                  request.resume();
                  response.on("close", () => Deferred.doneUnsafe(dropped, Effect.void));
                  controller.abort(reason);
                });
                server.listen(0, "127.0.0.1", () => resume(Effect.succeed(server)));
              }),
              (server) => Effect.sync(() => server.close().closeAllConnections()),
            );
            const { port } = gateway.address() as AddressInfo;

            yield* chain.isolated(
              Effect.gen(function* () {
                yield* chain.write({
                  address: facts["resolver"] as Address,
                  abi: parseAbi(["function setRevertURL(string)"]),
                  functionName: "setRevertURL",
                  args: [`http://127.0.0.1:${port}/`],
                  account: devnet.accounts.deployer,
                });

                const rejected = yield* Effect.promise(() =>
                  reader.resolver.resolve({ name, data, signal: controller.signal }).then(
                    () => undefined,
                    (error: unknown) => error,
                  ),
                );
                assert.strictEqual(rejected, reason);
                yield* Deferred.await(dropped).pipe(Effect.timeout("2 seconds"));

                const impatient = Ensforge.create({
                  publicClient: createPublicClient({
                    chain: devnet.chain,
                    transport: http(devnet.rpcUrl, { timeout: 500 }),
                  }),
                  deployment: devnet.deployments,
                });
                yield* expectFailure(Actions.resolver.resolve(impatient, { name, data }), {
                  _tag: "GatewayError",
                  code: "GATEWAY_REQUEST_FAILED",
                });
              }),
            );
          }).pipe(Effect.scoped),
        { meta: { cases: ["X12"] } },
      );

      // After the launch the ENSv1 bridge follows ENSv1 lookups itself, without the caller's
      // gateways, so only the ENSv1-only profile sends them through the caller's batch gateways.
      if (profile === "v1-live") {
        it.effect(
          "sends lookups through the batch gateways the caller names",
          () =>
            Effect.gen(function* () {
              const devnet = yield* Devnet;
              const chain = yield* Chain;
              const { reader } = yield* Clients;
              const gateways = yield* Gateways;
              const { name, facts } = (yield* Fixtures).byId("resolver.offchain");
              const gateway = yield* gateways.serve(() => ({ status: 200, body: '{"data":"0x"}' }));
              const data = encodeFunctionData({
                abi: Abis.shared.addrResolver,
                functionName: "addr",
                args: [namehash(name)],
              });

              yield* chain.isolated(
                Effect.gen(function* () {
                  yield* chain.write({
                    address: facts["resolver"] as Address,
                    abi: parseAbi(["function setRevertURL(string)"]),
                    functionName: "setRevertURL",
                    args: [gateway.url],
                    account: devnet.accounts.deployer,
                  });

                  // Port 9 (discard) refuses the connection: the batch gateway is the one used.
                  const gatewayUrls = ["http://127.0.0.1:9/"];
                  yield* expectFailure(
                    Actions.resolver.resolve(reader, { name, data, gatewayUrls }),
                    {
                      _tag: "GatewayError",
                      code: "GATEWAY_REQUEST_FAILED",
                    },
                  );
                }),
              );
            }).pipe(Effect.scoped),
          { meta: { cases: ["M:F5"] } },
        );

        // Gasless DNS (ENSIP-17): the OffchainDNSResolver on `com` proves the name's
        // `ENS1 <resolver>` TXT record, then calls that resolver, which here raises a lookup in
        // the OffchainDNSResolver's name instead of its own.
        it.effect(
          "fails with a typed error when a DNS name's resolver forges an off-chain lookup",
          () =>
            Effect.gen(function* () {
              const devnet = yield* Devnet;
              const chain = yield* Chain;
              const { reader } = yield* Clients;
              const gateways = yield* Gateways;
              const name = "ensforge-forged.com";
              const proof = txtProof(
                name,
                [`ENS1 ${devnet.contract("mock.nonCcipAwareResolver")}`],
                Number(yield* chain.now) - 60,
                // The records sit on the name itself, not on `_ens.<name>` as for a claim.
                { recordNames: [name], labels: 2 },
              );
              const gateway = yield* gateways.serveProof(proof);
              const data = encodeFunctionData({
                abi: Abis.shared.addrResolver,
                functionName: "addr",
                args: [namehash(name)],
              });

              yield* chain.isolated(
                Effect.gen(function* () {
                  // `gatewayURL` is the resolver's first storage slot; a string under 32 bytes is
                  // stored in place, with twice its length in the last byte.
                  const url = toBytes(gateway.url);
                  yield* chain.setStorage(
                    devnet.contract("v1.offchainDnsResolver"),
                    "0x0",
                    toHex(
                      concatBytes([
                        pad(url, { dir: "right", size: 31 }),
                        toBytes(url.length * 2, { size: 1 }),
                      ]),
                    ),
                  );

                  const error = yield* expectFailure(
                    Actions.resolver.resolve(reader, { name, data }),
                    { _tag: "ContractRevertError", code: "CONTRACT_REVERTED" },
                  );
                  assert.strictEqual(error.errorName, "InvalidOperation");
                  assert.isAbove(gateway.requests(), 0);
                }),
              );
            }).pipe(Effect.scoped),
          { meta: { cases: ["X07"] } },
        );
      }
    });
  }
});
