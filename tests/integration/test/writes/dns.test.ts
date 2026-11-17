import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import { Devnet, type DevnetInstance } from "@ensforge/test-devnet";
import { expectFailure } from "@ensforge/test-harness";
import type { Address } from "viem";

import { ensforge, isolated, onProfile } from "../support/chain.ts";
import { gatewayAnswer, ownerText, txtProof } from "../support/dnssec.ts";
import { gateway } from "../support/gateway.ts";

// DNS names are imported with DNSSEC proofs from a gateway (ENSIP-17). The gateway here answers
// with proofs signed for ens-contracts' test anchor, which the devnet's oracle trusts.

const name = "ensforge-dns.com";

const now = (devnet: DevnetInstance) =>
  Effect.promise(() => devnet.client.getBlock()).pipe(
    Effect.map((block) => Number(block.timestamp)),
  );

/** A gateway proving `texts` for `_ens.<name>`, signed a minute before `at`. */
const provingGateway = (texts: readonly string[], at: number) =>
  gateway(() => gatewayAnswer(txtProof(name, texts, at - 60)));

describe("DNS names", () => {
  onProfile("v1-live")("v1-live", (it) => {
    it.effect(
      "imports a DNS name to the owner its TXT record names, from any sender",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const { alice, bob } = devnet.accounts;
          const { url } = yield* provingGateway([ownerText(alice)], yield* now(devnet));
          const gatewayUrls = [url];
          const reader = ensforge(devnet);

          const proof = yield* Actions.dns.getProof(reader, { name, gatewayUrls });
          assert.deepStrictEqual(proof.txt, [ownerText(alice)]);
          assert.include(yield* Actions.dns.getStatus(reader, { name, gatewayUrls }), {
            imported: false,
            dnsOwner: alice,
            proofValid: true,
          });

          yield* isolated(
            devnet,
            Effect.gen(function* () {
              yield* Actions.dns.claimSync(ensforge(devnet, { account: bob }), {
                name,
                gatewayUrls,
              });
              assert.strictEqual(
                yield* Actions.name.get(reader, { name }).pipe(Effect.map((state) => state.owner)),
                alice,
              );
            }),
          );
        }),
      { meta: { cases: ["D01"] } },
    );

    it.effect("sets a resolver while claiming, only as the DNS owner", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const { alice, bob } = devnet.accounts;
        const resolver = devnet.contracts["v1.publicResolver"] as Address;
        const { url } = yield* provingGateway([ownerText(alice)], yield* now(devnet));
        const options = { name, gatewayUrls: [url], resolver };

        yield* expectFailure(Actions.dns.claim(ensforge(devnet, { account: bob }), options), {
          _tag: "UnauthorizedError",
          code: "NOT_OWNER",
        });
        yield* isolated(
          devnet,
          Effect.gen(function* () {
            yield* Actions.dns.claimSync(ensforge(devnet, { account: alice }), options);
            const state = yield* Actions.name.get(ensforge(devnet), { name });
            assert.include(state, { owner: alice, resolver });

            // DNS records live on the public resolver; the owner hosts a zonehash there.
            const zonehash =
              "0xe301017012204edd2984eeaf3ddf50bac238ec95c5713fb40b5e428b508fdbe55d3b9f155ffe" as const;
            yield* Actions.dns.setRecordsSync(ensforge(devnet, { account: alice }), {
              name,
              zonehash,
            });
            yield* expectFailure(
              Actions.dns.setRecords(ensforge(devnet, { account: bob }), { name, zonehash: null }),
              { _tag: "UnauthorizedError", code: "NOT_OWNER" },
            );
          }),
        );
      }),
    );

    it.effect("refuses proofs that do not hold, and gateways that fail", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const { alice } = devnet.accounts;
        const at = yield* now(devnet);
        const ens = ensforge(devnet, { account: alice });

        const missing = yield* provingGateway(["v=spf1 -all"], at);
        yield* expectFailure(Actions.dns.claim(ens, { name, gatewayUrls: [missing.url] }), {
          _tag: "DnsError",
          code: "DNS_RECORD_MISSING",
        });

        // DNSRegistrar takes no proof older than the last one it imported.
        const fresh = yield* provingGateway([ownerText(alice)], at);
        const stale = yield* provingGateway([ownerText(alice)], at - 3600);
        yield* isolated(
          devnet,
          Effect.gen(function* () {
            yield* Actions.dns.claimSync(ens, { name, gatewayUrls: [fresh.url] });
            yield* expectFailure(Actions.dns.claim(ens, { name, gatewayUrls: [stale.url] }), {
              _tag: "DnsError",
              code: "PROOF_STALE",
            });
          }),
        );

        const down = yield* gateway(() => ({ status: 500, body: "{}" }));
        yield* expectFailure(Actions.dns.claim(ens, { name, gatewayUrls: [down.url] }), {
          _tag: "GatewayError",
          code: "GATEWAY_REQUEST_FAILED",
        });
        const garbled = yield* gateway(() => ({ status: 200, body: '{"data":"0x1234"}' }));
        yield* expectFailure(Actions.dns.claim(ens, { name, gatewayUrls: [garbled.url] }), {
          _tag: "GatewayError",
          code: "GATEWAY_RESPONSE_INVALID",
        });
      }),
    );

    it.effect("refuses names and proofs the registrar cannot take", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const { alice } = devnet.accounts;
        const at = yield* now(devnet);
        const ens = ensforge(devnet, { account: alice });

        // `.test` is not a public suffix the DNSRegistrar serves.
        const local = "ensforge-dns.test";
        const unlisted = yield* gateway(() =>
          gatewayAnswer(txtProof(local, [ownerText(alice)], at - 60)),
        );
        yield* expectFailure(Actions.dns.claim(ens, { name: local, gatewayUrls: [unlisted.url] }), {
          _tag: "DnsError",
          code: "TLD_NOT_PUBLIC",
        });

        // Signed for a moment that has not come yet: the oracle refuses it.
        const early = yield* provingGateway([ownerText(alice)], at + 30 * 86_400);
        yield* expectFailure(Actions.dns.claim(ens, { name, gatewayUrls: [early.url] }), {
          _tag: "DnsError",
          code: "DNSSEC_PROOF_FAILED",
        });

        yield* expectFailure(
          Actions.dns.claim(ens, {
            name,
            proof: {
              name,
              rrsets: [{ rrset: "0x12", sig: "0x" }],
              inception: 0,
              expiration: 0,
              txt: [],
            },
          }),
          { _tag: "InvalidInputError", code: "INVALID_RECORD_VALUE" },
        );
        const proven = yield* provingGateway([ownerText(alice)], at);
        yield* expectFailure(
          Actions.dns.claim(ens, { name, gatewayUrls: [proven.url], resolver: "0x1234" }),
          { _tag: "InvalidInputError", code: "INVALID_ADDRESS" },
        );
      }),
    );

    // Before the launch the deployment names no DNSSEC gateway; reads need `gatewayUrls`.
    it.effect("needs gateways for DNSSEC reads, and reports the ones that fail", () =>
      Effect.gen(function* () {
        const ens = ensforge(yield* Devnet);
        const noGateway = { _tag: "UnsupportedError", code: "UNSUPPORTED_ON_DEPLOYMENT" } as const;
        yield* expectFailure(Actions.dns.getProof(ens, { name }), noGateway);
        yield* expectFailure(Actions.dns.getStatus(ens, { name }), noGateway);
        yield* expectFailure(Actions.dns.getOffchainResolver(ens, { name }), noGateway);

        const down = yield* gateway(() => ({ status: 500, body: "{}" }));
        const garbled = yield* gateway(() => ({ status: 200, body: '{"data":"0x1234"}' }));
        for (const [url, code] of [
          [down.url, "GATEWAY_REQUEST_FAILED"],
          [garbled.url, "GATEWAY_RESPONSE_INVALID"],
        ] as const) {
          const expected = { _tag: "GatewayError", code };
          yield* expectFailure(Actions.dns.getProof(ens, { name, gatewayUrls: [url] }), expected);
          yield* expectFailure(Actions.dns.getStatus(ens, { name, gatewayUrls: [url] }), expected);
          yield* expectFailure(
            Actions.dns.getOffchainResolver(ens, { name, gatewayUrls: [url] }),
            expected,
          );
        }
      }),
    );
  });
});
