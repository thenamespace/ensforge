import { Effect } from "effect";

import { CurrentStep } from "@ensforge/test-devnet";
import { hexToBigInt, labelhash, namehash, type Address } from "viem";

import { expectState } from "../builders/check.ts";
import { setV1Records } from "../builders/records.ts";
import { wrapName } from "../builders/v1.ts";
import type { Fixture } from "../fixture.ts";
import { coins } from "./values.ts";

/**
 * Replays what DNSRegistrar.proveAndClaim does for `label.com` once its DNSSEC proof checks out:
 * the registrar, owner of `com`, sets the record. Proof verification itself is tested with real
 * proofs (D11, D12).
 */
const imported = Effect.fnUntraced(function* (label: string, owner: Address) {
  const c = yield* CurrentStep;
  const registrar = yield* c.address("v1.dnsRegistrar");
  const resolver = yield* c.address("v1.publicResolver");
  yield* c.cheat((client) => client.impersonateAccount({ address: registrar }));
  yield* c.cheat((client) => client.setBalance({ address: registrar, value: 10n ** 18n }));
  yield* c.write(
    "v1.registry",
    "setSubnodeRecord",
    [namehash("com"), labelhash(label), owner, resolver, 0n],
    { from: registrar },
  );
  yield* c.cheat((client) => client.stopImpersonatingAccount({ address: registrar }));

  const name = `${label}.com`;
  yield* setV1Records({
    resolver,
    node: namehash(name),
    from: owner,
    records: { addresses: [[coins.eth, owner]] },
  });
  return { name, owner, resolver };
});

/** DNS names: imported on ENSv1 (also wrapped), a TLD synced into ENSv2. */
export const dns: readonly Fixture[] = [
  {
    id: "dns.imported",
    cases: ["M:C4", "D07", "D08"],
    tags: { kind: "dns", state: "imported", cheat: "impersonation" },
    prelaunch: (c) => imported("imported", c.accounts.alice),
    check: (c, facts) =>
      Effect.gen(function* () {
        const owner = yield* c.read("v1.registry", "owner", [namehash(String(facts["name"]))]);
        yield* expectState("dns.imported", "owner", owner, c.accounts.alice);
      }),
  },
  {
    id: "dns.imported.wrapped",
    cases: ["D15", "T13"],
    tags: { kind: "dns", state: "imported", wrapped: "true", cheat: "impersonation" },
    prelaunch: (c) =>
      Effect.gen(function* () {
        const name = yield* imported("wrapped-dns", c.accounts.bob);
        yield* wrapName({ name: name.name, owner: c.accounts.bob });
        return name;
      }),
    // A non-`.eth` name wrapped without a parent setting it has wrapper expiry 0.
    check: (c, facts) =>
      Effect.gen(function* () {
        const [owner, , expiry] = yield* c.read<readonly [Address, number, bigint]>(
          "v1.nameWrapper",
          "getData",
          [hexToBigInt(namehash(String(facts["name"])))],
        );
        yield* expectState("dns.imported.wrapped", "wrapper owner", owner, c.accounts.bob);
        yield* expectState("dns.imported.wrapped", "wrapper expiry", expiry, 0n);
      }),
  },
  {
    id: "dns.synced-tld",
    cases: ["D17", "T14", "M:C2"],
    tags: { kind: "dns", state: "synced-tld" },
    v2: true,
    launched: true,
    // The TemporaryDNSRegistrar turns a reserved public-suffix TLD into a registered one.
    postlaunch: (c) =>
      Effect.gen(function* () {
        yield* c.write("v2.temporaryDnsRegistrar", "syncTLD", ["org"]);
        return { name: "org", owner: c.accounts.owner };
      }),
    check: (c) =>
      Effect.gen(function* () {
        const status = yield* c.read("v2.rootRegistry", "getStatus", [
          hexToBigInt(labelhash("org")),
        ]);
        yield* expectState("dns.synced-tld", "status", status, 2);
        const owner = yield* c.read("v2.rootRegistry", "findOwner", ["org"]);
        yield* expectState("dns.synced-tld", "owner", owner, c.accounts.owner);
      }),
  },
];
