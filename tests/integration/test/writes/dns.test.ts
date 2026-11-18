import { assert, describe } from "@effect/vitest";
import { Effect, String as Str } from "effect";

import { Name } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { expectFailure } from "@ensforge/test-harness";
import { parseAbi } from "viem";

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
          const now = yield* chain.now;
          const signedAt = Number(now) - 60;
          // DNSRegistrar parses the hex without a checksum, so neither does ensforge.
          const txt = `a=${Str.toLowerCase(accounts.alice)}`;
          const { url } = yield* gateways.serveProof(txtProof(name, [txt], signedAt));
          const gatewayUrls = [url];

          const proof = yield* Actions.dns.getProof(clients.reader, { name, gatewayUrls });
          assert.deepStrictEqual(proof.txt, [txt]);
          const status = yield* Actions.dns.getStatus(clients.reader, { name, gatewayUrls });
          assert.include(status, {
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
        const now = yield* chain.now;
        const signedAt = Number(now) - 60;
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
            const claimedName = yield* Actions.name.get(clients.reader, { name });
            assert.include(claimedName, {
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

    it.effect(
      "refuses proofs that do not hold, and gateways that fail",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const gateways = yield* Gateways;
          const ens = clients.make({ account: accounts.alice });
          const chainNow = yield* chain.now;
          const now = Number(chainNow);

          // No `_ens` record (an empty answer, as for NXDOMAIN), no owner in it, a malformed owner,
          // or a proof for another name: there is no owner to import to.
          for (const proof of [
            [],
            txtProof(name, ["v=spf1 -all"], now - 60),
            txtProof(name, ["a=0xzz"], now - 60),
            txtProof("other.com", [`a=${accounts.alice}`], now - 60),
          ]) {
            const { url } = yield* gateways.serveProof(proof);
            yield* expectFailure(Actions.dns.claim(ens, { name, gatewayUrls: [url] }), {
              _tag: "DnsError",
              code: "DNS_RECORD_MISSING",
            });
            const statusAfterFailedClaim = yield* Actions.dns.getStatus(clients.reader, {
              name,
              gatewayUrls: [url],
            });
            assert.include(statusAfterFailedClaim, {
              dnsOwner: null,
              action: "set-txt-record",
            });
          }

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
      { meta: { cases: ["D02", "D11", "D12"] } },
    );

    it.effect(
      "refuses names and proofs the registrar cannot take",
      () =>
        Effect.gen(function* () {
          const { accounts } = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const gateways = yield* Gateways;
          const ens = clients.make({ account: accounts.alice });
          const chainNow = yield* chain.now;
          const now = Number(chainNow);

          // `.test` is not a public suffix the DNSRegistrar serves.
          const local = "ensforge-dns.test";
          const unlisted = yield* gateways.serveProof(
            txtProof(local, [`a=${accounts.alice}`], now - 60),
          );
          yield* expectFailure(
            Actions.dns.claim(ens, { name: local, gatewayUrls: [unlisted.url] }),
            {
              _tag: "DnsError",
              code: "TLD_NOT_PUBLIC",
            },
          );

          // The oracle refuses a signature not valid yet or expired, one by a key it does not know,
          // and a wildcard expansion (fewer labels signed than the name has).
          const owner = [`a=${accounts.alice}`];
          for (const proof of [
            txtProof(name, owner, now + 30 * 86_400),
            txtProof(name, owner, now - 60, { expiration: now - 30 }),
            txtProof(name, owner, now - 60, { keyTag: 999 }),
            txtProof(name, owner, now - 60, { labels: 2 }),
          ]) {
            const { url } = yield* gateways.serveProof(proof);
            yield* expectFailure(Actions.dns.claim(ens, { name, gatewayUrls: [url] }), {
              _tag: "DnsError",
              code: "DNSSEC_PROOF_FAILED",
            });
            const status = yield* Actions.dns.getStatus(clients.reader, {
              name,
              gatewayUrls: [url],
            });
            assert.include(status, {
              dnsOwner: accounts.alice,
              proofValid: false,
              action: "proof-invalid",
            });
          }

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
      { meta: { cases: ["D03", "D11", "D14", "H22"] } },
    );

    it.effect(
      "imports a name under a public suffix of several labels",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const clients = yield* Clients;
          const gateways = yield* Gateways;
          const { alice, owner } = devnet.accounts;
          const nested = "ensforge-dns.co.nz";
          const now = yield* chain.now;
          const signedAt = Number(now) - 60;
          const { url } = yield* gateways.serveProof(txtProof(nested, [`a=${alice}`], signedAt));

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* chain.write({
                address: devnet.contract("v1.publicSuffixList"),
                abi: parseAbi(["function addPublicSuffixes(bytes[] names)"]),
                functionName: "addPublicSuffixes",
                args: [[Name.dnsEncode("co.nz")]],
                account: owner,
              });
              yield* Actions.dns.claimSync(clients.make({ account: alice }), {
                name: nested,
                gatewayUrls: [url],
              });

              assert.strictEqual(
                (yield* Actions.name.get(clients.reader, { name: nested })).owner,
                alice,
              );
            }),
          );
        }),
      { meta: { cases: ["H21"] } },
    );

    // Before the launch the deployment names no DNSSEC gateway; reads need `gatewayUrls`.
    it.effect(
      "needs gateways for DNSSEC reads, and reports the ones that fail",
      () =>
        Effect.gen(function* () {
          const { reader } = yield* Clients;
          const gateways = yield* Gateways;

          const noGateway = {
            _tag: "UnsupportedError",
            code: "UNSUPPORTED_ON_DEPLOYMENT",
          } as const;
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
      { meta: { cases: ["D14"] } },
    );
  });
});
