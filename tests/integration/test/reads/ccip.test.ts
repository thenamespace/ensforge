import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import {
  encodeAbiParameters,
  encodeErrorResult,
  encodeFunctionData,
  namehash,
  parseAbi,
  type Address,
} from "viem";

import { Clients } from "../support/clients.ts";
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
        { meta: { cases: ["M:B10"] } },
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

      // After the launch the ENSv1 bridge follows ENSv1 lookups itself, without the caller's
      // gateways, so only the ENSv1-only profile sends them through the caller's batch gateways.
      if (profile === "v1-live") {
        it.effect("sends lookups through the batch gateways the caller names", () =>
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
        );
      }
    });
  }
});
