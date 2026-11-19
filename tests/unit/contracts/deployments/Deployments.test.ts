import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Predicate, Record as Rec, String as Str } from "effect";

import { Deployments } from "@ensforge/contracts";
import { getAddress, type Address } from "viem";

const issuesOf = (profile: unknown): readonly string[] => {
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- feeds define malformed profiles on purpose
    Deployments.define(profile as Deployments.Profile);
    return [];
  } catch (error) {
    assert.instanceOf(error, Deployments.InvalidProfileError);
    return error.issues;
  }
};

describe("Deployments built-in profiles", () => {
  const profiles = Arr.map(Deployments.list(), (profile) => [profile.name, profile] as const);

  it.each(profiles)("%s passes define", (_, profile) => {
    assert.deepStrictEqual(issuesOf(profile), []);
    assert.strictEqual(Deployments.get({ chainId: profile.chainId }), profile);
  });

  it.each(profiles)("%s addresses are checksummed", (_, { v1, v2 }) => {
    const groups = [
      v1?.contracts,
      v2?.contracts,
      v2?.implementations,
      v2?.migration,
      v2?.infrastructure,
      v2?.dns,
      v2?.hca,
      v2?.paymentTokens,
    ];
    const all = [
      ...Arr.flatMap(groups, (group) => Rec.values<string, Address | undefined>({ ...group })),
      ...(v1?.legacyPublicResolvers ?? []),
      ...(v1?.frozenPublicResolvers ?? []),
    ];
    for (const address of all) {
      assert.isDefined(address);
      assert.strictEqual(address, getAddress(address));
    }
  });

  // Within one group each role has its own contract; the shared EntryPoint and the public
  // Universal Resolver proxy are the documented exceptions across groups.
  it.each(profiles)("%s has one address per role within each group", (_, { v1, v2 }) => {
    for (const group of [v1?.contracts, v2?.contracts, v2?.migration, v2?.hca, v2?.dns]) {
      const addresses = Arr.map(Rec.values<string, Address>({ ...group }), Str.toLowerCase);
      assert.strictEqual(new Set(addresses).size, addresses.length);
    }
  });

  it("returns undefined for chains without a profile", () => {
    assert.isUndefined(Deployments.get({ chainId: 31337 }));
  });
});

describe("Deployments.define", () => {
  const { v1, v2 } = Deployments.sepolia;
  const valid = { name: "devnet", chainId: 31337 };
  const devV1 = { ...v1, chainId: 31337 };
  const devV2 = { ...v2, chainId: 31337 };

  it("accepts a custom profile and returns it unchanged", () => {
    const profile = { ...valid, v2: devV2 };
    assert.strictEqual(Deployments.define(profile), profile);
  });

  it.each([
    ["an empty name", { ...valid, name: "", v2: devV2 }, ["name must be a non-empty string"]],
    [
      "a zero chain id",
      { name: "x", chainId: 0 },
      ["chainId must be a positive integer", "at least one of v1 and v2 is required"],
    ],
    [
      "a fractional chain id",
      { ...valid, chainId: 1.5, v2: { ...v2, chainId: 1.5 } },
      ["chainId must be a positive integer"],
    ],
    ["no deployment", valid, ["at least one of v1 and v2 is required"]],
    [
      "a mismatched chain id",
      { ...valid, v2 },
      ["v2.chainId must equal the profile chainId 31337"],
    ],
    [
      "a wrong protocol",
      { ...valid, v1: { ...devV1, protocol: "v2" } },
      ['v1.protocol must be "v1"'],
    ],
    [
      "an unknown status",
      { ...valid, v2: { ...devV2, status: "live" } },
      ["v2.status must be active, beta or legacy"],
    ],
    ["an empty id", { ...valid, v1: { ...devV1, id: "" } }, ["v1.id must be a non-empty string"]],
    [
      "a missing contract",
      { ...valid, v2: { ...devV2, contracts: { ...v2.contracts, ethRegistry: undefined } } },
      ["v2.contracts.ethRegistry is required"],
    ],
    [
      "a malformed address",
      { ...valid, v1: { ...devV1, contracts: { ...v1.contracts, registry: "0x1234" } } },
      ["v1.contracts.registry must be a 0x-prefixed 20-byte address"],
    ],
    [
      "an unknown contract",
      { ...valid, v2: { ...devV2, hca: { ...v2.hca, bundler: v2.hca.entryPoint } } },
      ["v2.hca.bundler is not a known contract"],
    ],
    [
      "a non-object group",
      { ...valid, v2: { ...devV2, migration: null } },
      ["v2.migration must be an object"],
    ],
    [
      "malformed legacy resolvers",
      { ...valid, v1: { ...devV1, legacyPublicResolvers: ["nope"] } },
      ["v1.legacyPublicResolvers must be an array of 0x-prefixed 20-byte addresses"],
    ],
    [
      "no capabilities",
      { ...valid, v2: { ...devV2, capabilities: undefined } },
      ["v2.capabilities is required"],
    ],
    [
      "an unknown capability value",
      {
        ...valid,
        v2: { ...devV2, capabilities: { ...v2.capabilities, hcaSessionDomain: "rhinestone" } },
      },
      ['v2.capabilities.hcaSessionDomain must be one of "smart-session", "hca"'],
    ],
    [
      "a missing capability",
      {
        ...valid,
        v2: { ...devV2, capabilities: { ...v2.capabilities, hcaContractOwners: undefined } },
      },
      ["v2.capabilities.hcaContractOwners must be one of true, false"],
    ],
  ])("reports %s", (_, profile, expected) => {
    assert.deepStrictEqual(issuesOf(profile), expected);
  });

  it("allows the optional groups to be left out", () => {
    const { dns: _dns, hca: _hca, paymentTokens: _tokens, ...core } = devV2;
    assert.deepStrictEqual(issuesOf({ ...valid, v2: core }), []);
  });

  it("reports every problem at once", () => {
    const issues = issuesOf({
      ...valid,
      v1: { ...devV1, contracts: { ...v1.contracts, registry: "0x1234", nameWrapper: undefined } },
      v2: { ...devV2, status: "live" },
    });
    assert.deepStrictEqual(issues, [
      "v1.contracts.nameWrapper is required",
      "v1.contracts.registry must be a 0x-prefixed 20-byte address",
      "v2.status must be active, beta or legacy",
    ]);
  });
});

// Every leaf of a nested record of constants.
const flatValues = (value: unknown): readonly unknown[] =>
  Predicate.isObject(value)
    ? Arr.flatten(Arr.map(Rec.values<string, unknown>({ ...value }), flatValues))
    : [value];

describe("Deployments.namespaces", () => {
  const families = Rec.toEntries(Deployments.namespaces);

  it.each(families)("%s addresses are checksummed", (_, family) => {
    const addresses = Arr.filter(
      Arr.flatMap([family.mainnet, "testnet" in family ? family.testnet : {}], (deployment) =>
        Arr.flatten(Arr.map(Rec.values<string, unknown>({ ...deployment }), flatValues)),
      ),
      (value): value is string =>
        Predicate.isString(value) && Str.startsWith("0x")(value) && value.length === 42,
    );
    assert.isAbove(addresses.length, 0);
    for (const address of addresses) assert.strictEqual(address, getAddress(address));
  });

  it.each(families)(
    "%s resolves through mainnet, and its testnet through Sepolia",
    (id, family) => {
      assert.strictEqual(family.id, id);
      assert.strictEqual(family.mainnet.ensChainId, 1);
      if ("testnet" in family) assert.strictEqual(family.testnet.ensChainId, 11155111);
    },
  );

  it("finds the namespace of a parent's ENS resolver in a profile", () => {
    const { basenames, celonames, durin, linea, namespace } = Deployments.namespaces;
    const { mainnet, sepolia } = Deployments;

    assert.strictEqual(
      Deployments.namespaceOf({ profile: mainnet, resolver: basenames.mainnet.l1Resolver }),
      "basenames",
    );
    assert.strictEqual(
      Deployments.namespaceOf({
        profile: sepolia,
        resolver: Str.toLowerCase(linea.testnet.l1Resolver),
      }),
      "linea",
    );
    assert.strictEqual(
      Deployments.namespaceOf({ profile: mainnet, resolver: celonames.mainnet.l1Resolver }),
      "celonames",
    );
    // Durin uses one resolver address on both networks.
    assert.strictEqual(
      Deployments.namespaceOf({ profile: sepolia, resolver: durin.mainnet.l1Resolver }),
      "durin",
    );
    assert.strictEqual(
      Deployments.namespaceOf({ profile: mainnet, resolver: namespace.mainnet.hybridResolvers.v2 }),
      "namespace",
    );
  });

  it("returns undefined for resolvers the profile does not list", () => {
    const resolver = Deployments.namespaces.basenames.mainnet.l1Resolver;

    assert.isUndefined(Deployments.namespaceOf({ profile: Deployments.sepolia, resolver }));
    assert.isUndefined(
      Deployments.namespaceOf({
        profile: Deployments.mainnet,
        resolver: Deployments.mainnet.v1.contracts.publicResolver,
      }),
    );
    assert.isUndefined(
      Deployments.namespaceOf({
        profile: { name: "devnet", chainId: 31337, v1: Deployments.mainnet.v1 },
        resolver,
      }),
    );
  });

  it("is validated by define", () => {
    const { basenames } = Deployments.namespaces;
    const profile = {
      name: "devnet",
      chainId: 31337,
      v1: { ...Deployments.mainnet.v1, chainId: 31337 },
    };

    assert.deepStrictEqual(
      issuesOf({
        ...profile,
        namespaces: { basenames: { ...basenames.mainnet, ensChainId: 31337 } },
      }),
      [],
    );
    assert.deepStrictEqual(
      issuesOf({
        ...profile,
        namespaces: {
          basenames: {
            ...basenames.mainnet,
            contracts: { ...basenames.mainnet.contracts, registry: "0x1234" },
          },
          ens: {},
        },
      }),
      [
        "namespaces.basenames.ensChainId must equal the profile chainId 31337",
        "namespaces.basenames.contracts.registry must be a 0x-prefixed 20-byte address",
        "namespaces.ens is not a known namespace",
      ],
    );
  });
});

describe("Deployments.offchainProviders", () => {
  const providers = Rec.toEntries(Deployments.offchainProviders);

  it.each(providers)("%s is well-formed", (id, provider) => {
    assert.strictEqual(provider.id, id);
    assert.isAbove(provider.resolvers.length, 0);
    assert.isAbove(provider.gateways.length, 0);
    for (const address of provider.resolvers) assert.strictEqual(address, getAddress(address));
    for (const gateway of provider.gateways) assert.isTrue(Str.startsWith("https://")(gateway));
  });

  it("gives each resolver one provider", () => {
    const resolvers = Arr.flatMap(Rec.values(Deployments.offchainProviders), (provider) =>
      Arr.map(provider.resolvers, Str.toLowerCase),
    );
    assert.strictEqual(new Set(resolvers).size, resolvers.length);
  });

  it("finds the provider of a resolver on its ENS chain", () => {
    const resolver = "0x1934fc75ad10d7eed51dc7a92773cac96a06be56";

    assert.strictEqual(
      Deployments.offchainProvider({ chainId: 1, resolver }),
      Deployments.offchainProviders.coinbase,
    );
    assert.isUndefined(Deployments.offchainProvider({ chainId: 11155111, resolver }));
  });
});
