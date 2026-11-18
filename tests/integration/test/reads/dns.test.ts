import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { Actions } from "@ensforge/sdk/effect";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import { namehash, zeroAddress } from "viem";

import { Clients } from "../support/clients.ts";
import { txtRecordsProof } from "../support/dnssec.ts";
import { Gateways } from "../support/gateways.ts";
import { onProfile } from "../support/lane.ts";

// Gasless DNS (ENSIP-17): the DNS TLD resolver reads a DNSSEC proof of the name's own TXT records
// from the gateways of the DNSSEC gateway provider, here pointed at an in-process gateway that
// signs for the devnet oracle's test anchor. Call within `chain.isolated`.
const serveTxt = (name: string, texts: readonly string[]) =>
  Effect.gen(function* () {
    const devnet = yield* Devnet;
    const chain = yield* Chain;
    const gateways = yield* Gateways;
    const signedAt = Number(yield* chain.now) - 60;
    const gateway = yield* gateways.serveProof(txtRecordsProof(name, texts, signedAt));

    yield* chain.write({
      address: devnet.contract("v2.dnssecGatewayProvider"),
      abi: Abis.v2.dnssecGatewayProvider,
      functionName: "setGateways",
      args: [[gateway.url]],
      account: devnet.accounts.owner,
    });
  });

describe("gasless DNS names", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "resolve through the resolver an ENS1 record names, by address or by ENS name",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const fixtures = yield* Fixtures;
          const clients = yield* Clients;
          const { reader } = clients;
          const { bob, carol } = devnet.accounts;
          const txtResolver = devnet.contract("v2.dnsTxtResolver");
          const name = "gasless.com";

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* serveTxt(name, [`ENS1 ${txtResolver} a[60]=${bob}`]);
              assert.deepStrictEqual(yield* Actions.dns.getOffchainResolver(reader, { name }), {
                resolver: txtResolver,
                context: `a[60]=${bob}`,
              });
              assert.strictEqual(yield* Actions.record.getAddress(reader, { name }), bob);

              // Without context the resolver has nothing to answer with.
              yield* serveTxt(name, [`ENS1 ${txtResolver}`]);
              assert.deepStrictEqual(yield* Actions.dns.getOffchainResolver(reader, { name }), {
                resolver: txtResolver,
                context: null,
              });
              assert.isNull(yield* Actions.record.getAddress(reader, { name }));

              // An ENS name stands for the address it resolves to.
              const named = fixtures.byId("records.v2").name;
              yield* Actions.record.setSync(clients.make({ account: bob }), {
                name: named,
                addresses: { eth: txtResolver },
              });
              yield* serveTxt(name, [`ENS1 ${named} a[60]=${carol}`]);
              assert.deepStrictEqual(yield* Actions.dns.getOffchainResolver(reader, { name }), {
                resolver: named,
                context: `a[60]=${carol}`,
              });
              assert.strictEqual(yield* Actions.record.getAddress(reader, { name }), carol);
            }),
          );
        }),
      { meta: { cases: ["D04", "M:C5"] } },
    );

    it.effect(
      "use the first ENS1 record whose resolver is usable",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const { reader } = yield* Clients;
          const { alice, bob } = devnet.accounts;
          const txtResolver = devnet.contract("v2.dnsTxtResolver");
          const name = "gasless.com";
          const unusable = [
            "nonsense",
            `ENS1 nonexistent.eth a[60]=${alice}`,
            `ENS1 0x1234 a[60]=${alice}`,
          ];

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* serveTxt(name, [...unusable, `ENS1 ${txtResolver} a[60]=${bob}`]);
              assert.deepStrictEqual(yield* Actions.dns.getOffchainResolver(reader, { name }), {
                resolver: txtResolver,
                context: `a[60]=${bob}`,
              });
              assert.strictEqual(yield* Actions.record.getAddress(reader, { name }), bob);

              yield* serveTxt(name, unusable);
              assert.isNull(yield* Actions.dns.getOffchainResolver(reader, { name }));
              assert.isNull(yield* Actions.record.getAddress(reader, { name }));
              yield* expectFailure(Actions.record.getAddress(reader, { name, strict: true }), {
                _tag: "NotFoundError",
                code: "RESOLVER_NOT_FOUND",
              });
            }),
          );
        }),
      { meta: { cases: ["D05"] } },
    );

    it.effect(
      "read an ENS1 record split into several strings whole",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const { reader } = yield* Clients;
          const { bob } = devnet.accounts;
          const txtResolver = devnet.contract("v2.dnsTxtResolver");
          const name = "gasless.com";
          // DNS splits the record at 255 bytes; the address comes after the split.
          const context = `t[notice]=${"x".repeat(300)} a[60]=${bob}`;

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* serveTxt(name, [`ENS1 ${txtResolver} ${context}`]);
              assert.deepStrictEqual(yield* Actions.dns.getOffchainResolver(reader, { name }), {
                resolver: txtResolver,
                context,
              });
              assert.strictEqual(yield* Actions.record.getAddress(reader, { name }), bob);
            }),
          );
        }),
      { meta: { cases: ["D19"] } },
    );

    it.effect(
      "resolve as another name through the DNS alias resolver",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const target = (yield* Fixtures).byId("records.v2").name;
          const { reader } = yield* Clients;
          const name = target.replace(/\.eth$/, ".com");

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* serveTxt(name, [`ENS1 ${devnet.contract("v2.dnsAliasResolver")} com eth`]);
              const address = yield* Actions.record.getAddress(reader, { name });
              assert.isNotNull(address);
              assert.strictEqual(
                address,
                yield* Actions.record.getAddress(reader, { name: target }),
              );
            }),
          );
        }),
      { meta: { cases: ["D10"] } },
    );
  });
});

describe("imported DNS names", () => {
  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect(
      "resolve on-chain before their ENS1 record, which serves once the resolver is cleared",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const chain = yield* Chain;
          const { name } = (yield* Fixtures).byId("dns.imported");
          const { reader } = yield* Clients;
          const { alice, bob } = devnet.accounts;

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* serveTxt(name, [`ENS1 ${devnet.contract("v2.dnsTxtResolver")} a[60]=${bob}`]);
              assert.strictEqual(yield* Actions.record.getAddress(reader, { name }), alice);

              yield* chain.write({
                address: devnet.contract("v1.registry"),
                abi: Abis.v1.ensRegistry,
                functionName: "setResolver",
                args: [namehash(name), zeroAddress],
                account: alice,
              });
              assert.strictEqual(yield* Actions.record.getAddress(reader, { name }), bob);
            }),
          );
        }),
      { meta: { cases: ["D07"] } },
    );

    // The parent's ENSv1 resolver is no wildcard, and the subname has a TXT record but no ENS1 one.
    it.effect(
      "have no resolver for a subname still on ENSv1 without one",
      () =>
        Effect.gen(function* () {
          const chain = yield* Chain;
          const name = `sub.${(yield* Fixtures).byId("dns.imported").name}`;
          const { reader } = yield* Clients;

          yield* chain.isolated(
            Effect.gen(function* () {
              yield* serveTxt(name, ["v=spf1 -all"]);
              assert.isNull(yield* Actions.record.getAddress(reader, { name }));
              yield* expectFailure(Actions.record.getAddress(reader, { name, strict: true }), {
                _tag: "NotFoundError",
                code: "RESOLVER_NOT_FOUND",
              });
            }),
          );
        }),
      { meta: { cases: ["D08"] } },
    );
  });
});
