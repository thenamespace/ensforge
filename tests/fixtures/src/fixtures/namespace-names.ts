import { Effect, type FileSystem } from "effect";

import type {
  ArtifactError,
  ArtifactName,
  CurrentStep,
  DeployError,
  L2ProfileName,
  StepContext,
} from "@ensforge/test-devnet";
import { labelhash, namehash, type Address } from "viem";

import { expectState } from "../builders/check.ts";
import {
  durinRegistry,
  namespaceRegistry,
  registerBasename,
  registerCeloName,
  registerLineaName,
  registerNamespaceName,
  setL2Records,
} from "../builders/l2.ts";
import { factAddress, type Facts, type Fixture, type RawFacts, type Tags } from "../fixture.ts";
import { durations } from "./durations.ts";

type Built<A> = Effect.Effect<A, DeployError | ArtifactError, FileSystem.FileSystem | CurrentStep>;

/** The records every live L2 fixture name gets: its owner's ETH address and a URL. */
const recordsFor = (name: string, owner: Address) => ({
  eth: owner,
  texts: { url: `https://ensforge.com/${name}` },
});

/**
 * A name on an L2, seeded on that L2's profile. `register` creates it (before the clock jump)
 * and returns its facts, `name`, `owner` and `resolver` among them; `check` reads its owner back.
 */
const l2Name = (options: {
  readonly id: string;
  readonly chain: L2ProfileName;
  readonly cases: readonly string[];
  readonly tags: Tags;
  readonly register: (c: StepContext) => Built<RawFacts>;
  readonly owner: (c: StepContext, facts: Facts) => Built<unknown>;
  /** The owner the check expects; the registered owner by default. */
  readonly expectedOwner?: (facts: Facts) => unknown;
}): Fixture => ({
  id: options.id,
  cases: options.cases,
  tags: { kind: "l2-name", ...options.tags },
  chain: options.chain,
  postlaunch: options.register,
  check: (c, facts) =>
    Effect.gen(function* () {
      const actual = yield* options.owner(c, facts);
      const expected = options.expectedOwner?.(facts) ?? facts["owner"];
      yield* expectState(options.id, "owner", actual, expected);
    }),
});

const basename = (options: {
  readonly id: string;
  readonly label: string;
  readonly cases: readonly string[];
  readonly state: string;
  readonly duration: bigint;
  readonly resolver?: "basenames.resolver" | "basenames.legacyResolver";
}): Fixture =>
  l2Name({
    id: options.id,
    chain: "l2-base",
    cases: options.cases,
    tags: {
      namespace: "basenames",
      state: options.state,
      ...(options.resolver === "basenames.legacyResolver" ? { resolver: "legacy" } : {}),
    },
    register: (c) =>
      Effect.gen(function* () {
        const name = `${options.label}.base.eth`;
        const owner = c.accounts.alice;
        const resolverKey = options.resolver ?? "basenames.resolver";
        const resolver = yield* c.address(resolverKey);
        const expiry = yield* registerBasename({
          label: options.label,
          owner,
          duration: options.duration,
          resolver,
        });
        const artifact: ArtifactName =
          resolverKey === "basenames.resolver"
            ? "basenames/UpgradeableL2Resolver"
            : "basenames/L2Resolver";
        yield* setL2Records({
          resolver: [resolver, artifact],
          node: namehash(name),
          from: owner,
          records: recordsFor(name, owner),
        });
        return { name, owner, resolver, expiry };
      }),
    // The registry keeps the owner after expiry; the registrar's `ownerOf` is the one that stops.
    owner: (c, facts) => c.read("basenames.registry", "owner", [namehash(String(facts["name"]))]),
  });

const lineaName = (options: {
  readonly id: string;
  readonly label: string;
  readonly cases: readonly string[];
  readonly state: string;
  readonly duration: bigint;
  readonly fuses?: number;
}): Fixture =>
  l2Name({
    id: options.id,
    chain: "l2-linea",
    cases: options.cases,
    tags: { namespace: "linea", state: options.state },
    register: (c) =>
      Effect.gen(function* () {
        const name = `${options.label}.linea.eth`;
        const owner = c.accounts.alice;
        const expiry = yield* registerLineaName({
          label: options.label,
          owner,
          duration: options.duration,
          ...(options.fuses === undefined ? {} : { fuses: options.fuses }),
        });
        const resolver = yield* c.address("linea.resolver");
        yield* setL2Records({
          resolver: [resolver, "linea/PublicResolver"],
          node: namehash(name),
          from: owner,
          records: recordsFor(name, owner),
        });
        return { name, owner, resolver, expiry };
      }),
    owner: (c, facts) =>
      c
        .read<readonly [Address, number, bigint]>("linea.nameWrapper", "getData", [
          BigInt(namehash(String(facts["name"]))),
        ])
        .pipe(Effect.map(([owner]) => owner)),
  });

const celoName = (options: {
  readonly id: string;
  readonly label: string;
  readonly cases: readonly string[];
  readonly state: string;
  readonly duration: bigint;
}): Fixture =>
  l2Name({
    id: options.id,
    chain: "l2-celo",
    cases: options.cases,
    tags: { namespace: "celonames", state: options.state },
    register: (c) =>
      Effect.gen(function* () {
        const name = `${options.label}.celo.eth`;
        const owner = c.accounts.alice;
        const expiry = c.time.now() + options.duration;
        yield* registerCeloName({ label: options.label, owner, expiry });
        const resolver = yield* c.address("celonames.registry");
        yield* setL2Records({
          resolver: [resolver, "celonames/CeloNames"],
          node: namehash(name),
          from: owner,
          records: recordsFor(name, owner),
        });
        return { name, owner, resolver, expiry, state: options.state };
      }),
    owner: (c, facts) =>
      c.read("celonames.registry", "ownerOf", [BigInt(namehash(String(facts["name"])))]),
    // Celonames has no grace: an expired name has no owner.
    expectedOwner: (facts) =>
      facts["state"] === "expired" ? "0x0000000000000000000000000000000000000000" : facts["owner"],
  });

/**
 * A Namespace name under `parent` on `chain`; the first name of each parent deploys the
 * parent's registry.
 */
const namespaceName = (options: {
  readonly id: string;
  readonly chain: "l2-base" | "l2-optimism";
  readonly parent: string;
  readonly label: string;
  readonly cases: readonly string[];
  readonly state: string;
  readonly duration: bigint;
  readonly deploysRegistry?: true;
}): Fixture => {
  const registryKey = `fixture.namespace.${options.parent}`;
  return l2Name({
    id: options.id,
    chain: options.chain,
    cases: options.cases,
    tags: { namespace: "namespace", parent: options.parent, state: options.state },
    register: (c) =>
      Effect.gen(function* () {
        const owner = c.accounts.alice;
        const registry =
          options.deploysRegistry === true
            ? yield* namespaceRegistry({ key: registryKey, parent: options.parent, owner })
            : yield* c.address(registryKey);
        const { name, expiry } = yield* registerNamespaceName({
          registryKey,
          parent: options.parent,
          label: options.label,
          owner,
          duration: options.duration,
        });
        const resolver = yield* c.address("namespace.publicResolver");
        yield* setL2Records({
          resolver: [resolver, "namespace/NamePublicResolver"],
          node: namehash(name),
          from: owner,
          records: recordsFor(name, owner),
        });
        return { name, owner, resolver, registry, expiry, state: options.state };
      }),
    owner: (c, facts) => c.read(registryKey, "ownerOf", [BigInt(namehash(String(facts["name"])))]),
    expectedOwner: (facts) =>
      facts["state"] === "expired" ? "0x0000000000000000000000000000000000000000" : facts["owner"],
  });
};

/** Names on each L2 namespace's chain, in every state ensforge reads differently. */
export const namespaceNames: readonly Fixture[] = [
  basename({
    id: "namespaces.basenames.active",
    label: "alice",
    cases: ["N01"],
    state: "active",
    duration: durations.active,
  }),
  basename({
    id: "namespaces.basenames.grace",
    label: "grace",
    cases: ["N02"],
    state: "grace",
    duration: durations.v1Grace,
  }),
  basename({
    id: "namespaces.basenames.expired",
    label: "expired",
    cases: ["N03"],
    state: "expired",
    duration: durations.expired,
  }),
  basename({
    id: "namespaces.basenames.legacy",
    label: "legacy",
    cases: ["N05"],
    state: "active",
    duration: durations.active,
    resolver: "basenames.legacyResolver",
  }),
  l2Name({
    id: "namespaces.basenames.subname",
    chain: "l2-base",
    cases: ["N04"],
    tags: { namespace: "basenames", state: "subname" },
    register: (c) =>
      Effect.gen(function* () {
        const name = "sub.subparent.base.eth";
        const resolver = yield* c.address("basenames.resolver");
        yield* registerBasename({
          label: "subparent",
          owner: c.accounts.alice,
          duration: durations.active,
          resolver,
        });
        yield* c.write(
          "basenames.registry",
          "setSubnodeRecord",
          [namehash("subparent.base.eth"), labelhash("sub"), c.accounts.bob, resolver, 0n],
          { from: c.accounts.alice },
        );
        yield* setL2Records({
          resolver: [resolver, "basenames/UpgradeableL2Resolver"],
          node: namehash(name),
          from: c.accounts.bob,
          records: recordsFor(name, c.accounts.bob),
        });
        return { name, owner: c.accounts.bob, resolver };
      }),
    owner: (c, facts) => c.read("basenames.registry", "owner", [namehash(String(facts["name"]))]),
  }),

  lineaName({
    id: "namespaces.linea.active",
    label: "alice",
    cases: ["N06"],
    state: "active",
    duration: durations.active,
  }),
  lineaName({
    id: "namespaces.linea.locked",
    label: "locked",
    cases: ["N24"],
    state: "locked",
    duration: durations.active,
    // cannotUnwrap (1) and cannotSetResolver (8).
    fuses: 9,
  }),
  lineaName({
    id: "namespaces.linea.grace",
    label: "grace",
    cases: ["N07"],
    state: "grace",
    duration: durations.v1Grace,
  }),
  l2Name({
    id: "namespaces.linea.subname",
    chain: "l2-linea",
    cases: ["N08"],
    tags: { namespace: "linea", state: "subname" },
    register: (c) =>
      Effect.gen(function* () {
        const name = "sub.subparent.linea.eth";
        yield* registerLineaName({
          label: "subparent",
          owner: c.accounts.alice,
          duration: durations.active,
        });
        const resolver = yield* c.address("linea.resolver");
        yield* c.write(
          "linea.nameWrapper",
          "setSubnodeRecord",
          [namehash("subparent.linea.eth"), "sub", c.accounts.bob, resolver, 0n, 0, 0n],
          { from: c.accounts.alice },
        );
        yield* setL2Records({
          resolver: [resolver, "linea/PublicResolver"],
          node: namehash(name),
          from: c.accounts.bob,
          records: recordsFor(name, c.accounts.bob),
        });
        return { name, owner: c.accounts.bob, resolver };
      }),
    owner: (c, facts) =>
      c
        .read<readonly [Address, number, bigint]>("linea.nameWrapper", "getData", [
          BigInt(namehash(String(facts["name"]))),
        ])
        .pipe(Effect.map(([owner]) => owner)),
  }),

  celoName({
    id: "namespaces.celonames.active",
    label: "alice",
    cases: ["N09"],
    state: "active",
    duration: durations.active,
  }),
  celoName({
    id: "namespaces.celonames.expired",
    label: "expired",
    cases: ["N10"],
    state: "expired",
    duration: durations.expired,
  }),

  l2Name({
    id: "namespaces.durin.active",
    chain: "l2-base",
    cases: ["N11", "N12"],
    tags: { namespace: "durin", state: "active" },
    register: (c) =>
      Effect.gen(function* () {
        const owner = c.accounts.alice;
        const registry = yield* durinRegistry({ parent: "durin-names.eth", admin: owner });
        const name = "alice.durin-names.eth";
        yield* c.write(
          [registry, "durin/L2Registry"],
          "createSubnode",
          [namehash("durin-names.eth"), "alice", owner, []],
          { from: owner },
        );
        yield* setL2Records({
          resolver: [registry, "durin/L2Registry"],
          node: namehash(name),
          from: owner,
          records: recordsFor(name, owner),
        });
        return { name, owner, resolver: registry, registry };
      }),
    owner: (c, facts) =>
      c.read([factAddress(facts, "registry"), "durin/L2Registry"], "owner", [
        namehash(String(facts["name"])),
      ]),
  }),

  namespaceName({
    id: "namespaces.namespace.base.active",
    chain: "l2-base",
    parent: "ns-base.eth",
    label: "alice",
    cases: ["N13"],
    state: "active",
    duration: durations.active,
    deploysRegistry: true,
  }),
  namespaceName({
    id: "namespaces.namespace.base.expired",
    chain: "l2-base",
    parent: "ns-base.eth",
    label: "expired",
    cases: ["N17"],
    state: "expired",
    duration: durations.expired,
  }),
  namespaceName({
    id: "namespaces.namespace.previous.active",
    chain: "l2-base",
    parent: "ns-previous.eth",
    label: "alice",
    cases: ["N13"],
    state: "active",
    duration: durations.active,
    deploysRegistry: true,
  }),
  namespaceName({
    id: "namespaces.namespace.v2.active",
    chain: "l2-base",
    parent: "ns-v2.eth",
    label: "alice",
    cases: ["N15"],
    state: "active",
    duration: durations.active,
    deploysRegistry: true,
  }),
  namespaceName({
    id: "namespaces.namespace.optimism.active",
    chain: "l2-optimism",
    parent: "ns-op.eth",
    label: "alice",
    cases: ["N14"],
    state: "active",
    duration: durations.active,
    deploysRegistry: true,
  }),
];
