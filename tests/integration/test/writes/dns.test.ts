import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { expectFailure } from "@ensforge/test-harness";

import { Clients } from "../support/clients.ts";
import { txtProof } from "../support/dnssec.ts";
import { Gateways } from "../support/gateways.ts";
import { onProfile } from "../support/lane.ts";

// DNS names are imported with DNSSEC proofs from a gateway (ENSIP-17). The gateways here answer
// with proofs signed for ens-contracts' test anchor, which the devnet's oracle trusts.

describe("DNS names", () => {
  onProfile("v1-live")("v1-live", (it) => {
    const name = "ensforge-dns.com";

    it.effect(
      "imports a DNS name to the owner its TXT record names, from any sender",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const gateways = yield* Gateways;
          const signedAt = Number(yield* chain.now) - 60;
          const { url } = yield* gateways.serveProof(
            txtProof(name, [`a=${accounts.alice}`], signedAt),
          );
          const gatewayUrls = [url];

          const proof = yield* Actions.dns.getProof(clients.reader, { name, gatewayUrls });
          assert.deepStrictEqual(proof.txt, [`a=${accounts.alice}`]);
          assert.include(yield* Actions.dns.getStatus(clients.reader, { name, gatewayUrls }), {
            imported: false,
            dnsOwner: accounts.alice,
            proofValid: true,
          });

          yield* chain.isolated(
            Effect.gen(function* () {
              const bob = clients.make({ account: accounts.bob });
              yield* Actions.dns.claimSync(bob, { name, gatewayUrls });

              const state = yield* Actions.name.get(clients.reader, { name });
              assert.strictEqual(state.owner, accounts.alice);
            }),
          );
        }),
      { meta: { cases: ["D01"] } },
    );

    it.effect("sets a resolver while claiming, only as the DNS owner", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const chain = yield* Chain;
        const clients = yield* Clients;
        const gateways = yield* Gateways;
        const { alice, bob } = devnet.accounts;
        const signedAt = Number(yield* chain.now) - 60;
        const { url } = yield* gateways.serveProof(txtProof(name, [`a=${alice}`], signedAt));
        const resolver = devnet.contract("v1.publicResolver");
        const options = { name, gatewayUrls: [url], resolver };

        yield* expectFailure(Actions.dns.claim(clients.make({ account: bob }), options), {
          _tag: "UnauthorizedError",
          code: "NOT_OWNER",
        });

        yield* chain.isolated(
          Effect.gen(function* () {
            const owner = clients.make({ account: alice });
            yield* Actions.dns.claimSync(owner, options);
            assert.include(yield* Actions.name.get(clients.reader, { name }), {
              owner: alice,
              resolver,
            });

            // DNS records live on the public resolver; the owner hosts a zonehash there.
            const zonehash =
              "0xe301017012204edd2984eeaf3ddf50bac238ec95c5713fb40b5e428b508fdbe55d3b9f155ffe";
            yield* Actions.dns.setRecordsSync(owner, { name, zonehash });
            yield* expectFailure(
              Actions.dns.setRecords(clients.make({ account: bob }), { name, zonehash: null }),
              { _tag: "UnauthorizedError", code: "NOT_OWNER" },
            );
          }),
        );
      }),
    );

    it.effect("refuses proofs that do not hold, and gateways that fail", () =>
      Effect.gen(function* () {
        const { accounts } = yield* Devnet;
        const chain = yield* Chain;
        const clients = yield* Clients;
        const gateways = yield* Gateways;
        const ens = clients.make({ account: accounts.alice });
        const now = Number(yield* chain.now);

        const missing = yield* gateways.serveProof(txtProof(name, ["v=spf1 -all"], now - 60));
        yield* expectFailure(Actions.dns.claim(ens, { name, gatewayUrls: [missing.url] }), {
          _tag: "DnsError",
          code: "DNS_RECORD_MISSING",
        });

        // DNSRegistrar takes no proof older than the last one it imported.
        const fresh = yield* gateways.serveProof(txtProof(name, [`a=${accounts.alice}`], now));
        const stale = yield* gateways.serveProof(
          txtProof(name, [`a=${accounts.alice}`], now - 3600),
        );
        yield* chain.isolated(
          Effect.gen(function* () {
            yield* Actions.dns.claimSync(ens, { name, gatewayUrls: [fresh.url] });
            yield* expectFailure(Actions.dns.claim(ens, { name, gatewayUrls: [stale.url] }), {
              _tag: "DnsError",
              code: "PROOF_STALE",
            });
          }),
        );

        const down = yield* gateways.serve(() => ({ status: 500, body: "{}" }));
        yield* expectFailure(Actions.dns.claim(ens, { name, gatewayUrls: [down.url] }), {
          _tag: "GatewayError",
          code: "GATEWAY_REQUEST_FAILED",
        });
        const garbled = yield* gateways.serve(() => ({ status: 200, body: '{"data":"0x1234"}' }));
        yield* expectFailure(Actions.dns.claim(ens, { name, gatewayUrls: [garbled.url] }), {
          _tag: "GatewayError",
          code: "GATEWAY_RESPONSE_INVALID",
        });
      }),
    );

    it.effect("refuses names and proofs the registrar cannot take", () =>
      Effect.gen(function* () {
        const { accounts } = yield* Devnet;
        const chain = yield* Chain;
        const clients = yield* Clients;
        const gateways = yield* Gateways;
        const ens = clients.make({ account: accounts.alice });
        const now = Number(yield* chain.now);

        // `.test` is not a public suffix the DNSRegistrar serves.
        const local = "ensforge-dns.test";
        const unlisted = yield* gateways.serveProof(
          txtProof(local, [`a=${accounts.alice}`], now - 60),
        );
        yield* expectFailure(Actions.dns.claim(ens, { name: local, gatewayUrls: [unlisted.url] }), {
          _tag: "DnsError",
          code: "TLD_NOT_PUBLIC",
        });

        // Signed for a moment that has not come yet: the oracle refuses it.
        const early = yield* gateways.serveProof(
          txtProof(name, [`a=${accounts.alice}`], now + 30 * 86_400),
        );
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
        const proven = yield* gateways.serveProof(txtProof(name, [`a=${accounts.alice}`], now));
        yield* expectFailure(
          Actions.dns.claim(ens, { name, gatewayUrls: [proven.url], resolver: "0x1234" }),
          { _tag: "InvalidInputError", code: "INVALID_ADDRESS" },
        );
      }),
    );

    // Before the launch the deployment names no DNSSEC gateway; reads need `gatewayUrls`.
    it.effect("needs gateways for DNSSEC reads, and reports the ones that fail", () =>
      Effect.gen(function* () {
        const { reader } = yield* Clients;
        const gateways = yield* Gateways;

        const noGateway = { _tag: "UnsupportedError", code: "UNSUPPORTED_ON_DEPLOYMENT" } as const;
        yield* expectFailure(Actions.dns.getProof(reader, { name }), noGateway);
        yield* expectFailure(Actions.dns.getStatus(reader, { name }), noGateway);
        yield* expectFailure(Actions.dns.getOffchainResolver(reader, { name }), noGateway);

        const down = yield* gateways.serve(() => ({ status: 500, body: "{}" }));
        const garbled = yield* gateways.serve(() => ({ status: 200, body: '{"data":"0x1234"}' }));
        for (const [url, code] of [
          [down.url, "GATEWAY_REQUEST_FAILED"],
          [garbled.url, "GATEWAY_RESPONSE_INVALID"],
        ] as const) {
          const options = { name, gatewayUrls: [url] };
          yield* expectFailure(Actions.dns.getProof(reader, options), {
            _tag: "GatewayError",
            code,
          });
          yield* expectFailure(Actions.dns.getStatus(reader, options), {
            _tag: "GatewayError",
            code,
          });
          yield* expectFailure(Actions.dns.getOffchainResolver(reader, options), {
            _tag: "GatewayError",
            code,
          });
        }
      }),
    );
  });
});
