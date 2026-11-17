import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Devnet, type DevnetInstance } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectRejection } from "@ensforge/test-harness";
import {
  encodeAbiParameters,
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

/** Points the off-chain fixture resolver's `OffchainLookup` at `url` (the mock's data URL is not HTTP). */
const lookupAt = (devnet: DevnetInstance, resolver: Address, url: string) =>
  Effect.promise(async () => {
    const hash = await devnet.client.writeContract({
      address: resolver,
      abi: parseAbi(["function setRevertURL(string)"]),
      functionName: "setRevertURL",
      args: [url],
      account: devnet.accounts.deployer,
      chain: devnet.chain,
    });
    await devnet.client.waitForTransactionReceipt({ hash });
  });

/** Runs `use` with the off-chain fixture resolver looking up at a gateway answering `answer`. */
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
      lookupAt(devnet, fixture.facts["resolver"] as Address, served.url).pipe(
        Effect.andThen(use({ devnet, name: fixture.name, requests: served.requests })),
      ),
    );
  }).pipe(Effect.scoped);

describe("CCIP-Read", () => {
  for (const profile of ["v1-live", "mainnet-shaped"] as const) {
    onProfile(profile)(profile, (it) => {
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
