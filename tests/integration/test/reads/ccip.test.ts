import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Devnet, type DevnetInstance } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectRejection } from "@ensforge/test-harness";
import {
  encodeAbiParameters,
  encodeErrorResult,
  encodeFunctionData,
  namehash,
  parseAbi,
  type Address,
  type Hex,
} from "viem";

import { call, ensforge, isolated, onProfile } from "../support/chain.ts";
import { gateway, type GatewayAnswer } from "../support/gateway.ts";

// The fixture resolvers answer `addr(bytes32)`; ensforge's record reads use other profiles.
const addrCall = (name: string): Hex =>
  encodeFunctionData({
    abi: parseAbi(["function addr(bytes32) view returns (address)"]),
    args: [namehash(name)],
  });

const ok: GatewayAnswer = { status: 200, body: '{"data":"0x"}' };

/** Calls a setter of a fixture's mock resolver, e.g. `function setRevertURL(string)`. */
const configure = (
  devnet: DevnetInstance,
  resolver: Address,
  setter: string,
  args: readonly unknown[],
) =>
  Effect.promise(async () => {
    const abi = parseAbi([setter]);
    const hash = await devnet.client.writeContract({
      address: resolver,
      abi,
      functionName: (abi[0] as { readonly name: string }).name,
      args,
      account: devnet.accounts.deployer,
      chain: devnet.chain,
    } as never);
    await devnet.client.waitForTransactionReceipt({ hash });
  });

const offchain = (
  answer: () => GatewayAnswer,
  use: (context: {
    readonly devnet: DevnetInstance;
    readonly name: string;
    readonly requests: () => number;
  }) => Effect.Effect<void, unknown>,
) =>
  Effect.gen(function* () {
    const fixtures = yield* Fixtures;
    const devnet = yield* Devnet;
    const fixture = fixtures.byId("resolver.offchain");
    const served = yield* gateway(answer);

    yield* isolated(
      devnet,
      // The mock's own `data:` URL is not HTTP, which viem requires.
      configure(devnet, fixture.facts["resolver"] as Address, "function setRevertURL(string)", [
        served.url,
      ]).pipe(Effect.andThen(use({ devnet, name: fixture.name, requests: served.requests }))),
    );
  }).pipe(Effect.scoped);

describe("CCIP-Read", () => {
  for (const profile of ["v1-live", "mainnet-shaped"] as const) {
    onProfile(profile)(profile, (it) => {
      it.effect(
        "never answers from an off-chain lookup that names another contract as its sender",
        () =>
          Effect.gen(function* () {
            const fixtures = yield* Fixtures;
            const devnet = yield* Devnet;
            const spoofed = fixtures.byId("resolver.spoofed-offchain-lookup");
            const served = yield* gateway(() => ok);
            const lookup = encodeErrorResult({
              abi: parseAbi([
                "error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData)",
              ]),
              errorName: "OffchainLookup",
              args: [devnet.accounts.bob, [served.url], "0x", "0x00000000", "0x"],
            });

            yield* isolated(
              devnet,
              Effect.gen(function* () {
                yield* configure(
                  devnet,
                  spoofed.facts["resolver"] as Address,
                  "function setResponse(bytes,bytes)",
                  [addrCall(spoofed.name), lookup],
                );
                // The Universal Resolver's batcher follows it and calls back the named sender, an
                // account here, which answers nothing: a typed error, never the gateway's data.
                yield* expectRejection(
                  () =>
                    ensforge(devnet).resolver.resolve({
                      name: spoofed.name,
                      data: addrCall(spoofed.name),
                    }),
                  { _tag: "UnsupportedError", code: "RESOLVER_PROFILE_UNSUPPORTED" },
                );
              }),
            );
          }).pipe(Effect.scoped),
        { meta: { cases: ["M:B12", "X05"] } },
      );

      it.effect(
        "follows an off-chain lookup through the resolver's gateway",
        () =>
          offchain(
            () => ok,
            ({ devnet, name, requests }) =>
              Effect.gen(function* () {
                const resolved = yield* call(() =>
                  ensforge(devnet).resolver.resolve({ name, data: addrCall(name) }),
                );
                assert.strictEqual(
                  resolved.data,
                  encodeAbiParameters([{ type: "address" }], [devnet.accounts.alice]),
                );
                assert.isAbove(requests(), 0);
              }),
          ),
        { meta: { cases: ["M:B10"] } },
      );

      it.effect(
        "does not contact the gateway when CCIP-Read is disabled",
        () =>
          offchain(
            () => ok,
            ({ devnet, name, requests }) =>
              Effect.gen(function* () {
                const ens = ensforge(devnet, { ccipRead: false });
                yield* expectRejection(() => ens.resolver.resolve({ name, data: addrCall(name) }), {
                  _tag: "ConfigError",
                  code: "CCIP_READ_DISABLED",
                });
                assert.strictEqual(requests(), 0);
              }),
          ),
        { meta: { cases: ["X13", "M:F4"] } },
      );

      it.effect(
        "reports a failing gateway with its HTTP status",
        () =>
          offchain(
            () => ({ status: 500, body: '{"message":"down"}' }),
            ({ devnet, name }) =>
              Effect.gen(function* () {
                const error = yield* expectRejection(
                  () => ensforge(devnet).resolver.resolve({ name, data: addrCall(name) }),
                  { _tag: "GatewayError", code: "GATEWAY_REQUEST_FAILED" },
                );
                assert.strictEqual((error as { readonly status?: number }).status, 500);
              }),
          ),
        { meta: { cases: ["M:B11", "X01"] } },
      );

      // After the launch the ENSv1 bridge follows ENSv1 lookups itself, without the caller's gateways.
      if (profile === "v1-live") {
        it.effect("sends lookups through the batch gateways the caller names", () =>
          offchain(
            () => ok,
            ({ devnet, name }) =>
              expectRejection(
                () =>
                  ensforge(devnet).resolver.resolve({
                    name,
                    data: addrCall(name),
                    gatewayUrls: ["http://127.0.0.1:9/"],
                  }),
                { _tag: "GatewayError", code: "GATEWAY_REQUEST_FAILED" },
              ).pipe(Effect.asVoid),
          ),
        );
      }
    });
  }
});
