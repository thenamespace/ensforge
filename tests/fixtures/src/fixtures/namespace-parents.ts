import { Effect, type FileSystem } from "effect";

import type { ArtifactError, CurrentStep, DeployError, StepContext } from "@ensforge/test-devnet";
import { namehash, parseAbi, type Address } from "viem";

import { expectState } from "../builders/check.ts";
import { registerV1 } from "../builders/v1.ts";
import type { Fixture, Tags } from "../fixture.ts";
import { durations } from "./durations.ts";

type Built<A> = Effect.Effect<A, DeployError | ArtifactError, FileSystem.FileSystem | CurrentStep>;

/**
 * An ENSv1 `.eth` name that an L2 namespace hangs off, as on mainnet: registered before the
 * launch, then pointed at its family's Ethereum resolver (deployed by the profile), whose
 * per-name setup `configure` does as the owner.
 */
const parent = (options: {
  readonly id: string;
  readonly label: string;
  readonly cases: readonly string[];
  readonly tags: Tags;
  readonly resolver: string;
  readonly configure?: (c: StepContext, node: `0x${string}`, owner: Address) => Built<unknown>;
}): Fixture => ({
  id: options.id,
  cases: options.cases,
  tags: { kind: "l2-parent", ...options.tags },
  namespaces: true,
  prelaunch: (c) =>
    Effect.gen(function* () {
      yield* registerV1({
        label: options.label,
        owner: c.accounts.alice,
        duration: durations.active,
      });
      return { name: `${options.label}.eth`, owner: c.accounts.alice };
    }),
  postlaunch: (c) =>
    Effect.gen(function* () {
      const node = namehash(`${options.label}.eth`);
      const resolver = yield* c.address(options.resolver);
      yield* c.write("v1.registry", "setResolver", [node, resolver], { from: c.accounts.alice });
      if (options.configure !== undefined) yield* options.configure(c, node, c.accounts.alice);
      return { resolver };
    }),
  check: (c, facts) =>
    Effect.gen(function* () {
      const actual = yield* c.read("v1.registry", "resolver", [namehash(String(facts["name"]))]);
      yield* expectState(options.id, "resolver", actual, facts["resolver"]);
    }),
});

/** A Namespace parent on a hybrid resolver, resolving its subnames from `resolutionType`. */
const namespaceParent = (options: {
  readonly id: string;
  readonly label: string;
  readonly cases: readonly string[];
  readonly hybrid: "current" | "previous";
  readonly resolutionType: bigint;
  readonly chain: string;
}): Fixture =>
  parent({
    id: options.id,
    label: options.label,
    cases: options.cases,
    tags: { namespace: "namespace", chain: options.chain, resolver: options.hybrid },
    resolver: `namespaces.namespace.hybridResolver.${options.hybrid}`,
    configure: (c, node, owner) =>
      c.write(
        `namespaces.namespace.hybridResolver.${options.hybrid}`,
        "setResolutionType",
        [node, options.resolutionType],
        { from: owner },
      ),
  });

/** The parents of every L2 namespace family. Durin's L2 registry is set where it is served. */
export const namespaceParents: readonly Fixture[] = [
  parent({
    id: "namespaces.parent.basenames",
    label: "base",
    cases: ["N01", "N02", "N03", "N04", "N05"],
    tags: { namespace: "basenames", chain: "8453" },
    resolver: "namespaces.basenames.l1Resolver",
  }),
  parent({
    id: "namespaces.parent.linea",
    label: "linea",
    cases: ["N06", "N07", "N08"],
    tags: { namespace: "linea", chain: "59144" },
    resolver: "namespaces.linea.l1Resolver",
  }),
  parent({
    id: "namespaces.parent.celonames",
    label: "celo",
    cases: ["N09", "N10"],
    tags: { namespace: "celonames", chain: "42220" },
    resolver: "namespaces.celonames.l1Resolver",
  }),
  parent({
    id: "namespaces.parent.durin",
    label: "durin-names",
    cases: ["N11", "N12"],
    tags: { namespace: "durin", chain: "8453" },
    resolver: "namespaces.durin.l1Resolver",
  }),
  namespaceParent({
    id: "namespaces.parent.namespace.base",
    label: "ns-base",
    cases: ["N13", "N17"],
    hybrid: "current",
    resolutionType: 8453n,
    chain: "8453",
  }),
  namespaceParent({
    id: "namespaces.parent.namespace.optimism",
    label: "ns-op",
    cases: ["N14"],
    hybrid: "current",
    resolutionType: 10n,
    chain: "10",
  }),
  namespaceParent({
    id: "namespaces.parent.namespace.previous",
    label: "ns-previous",
    cases: ["N13"],
    hybrid: "previous",
    resolutionType: 8453n,
    chain: "8453",
  }),
  namespaceParent({
    id: "namespaces.parent.namespace.offchain",
    label: "ns-offchain",
    cases: ["N16"],
    hybrid: "current",
    resolutionType: 9999n,
    chain: "offchain",
  }),
  parent({
    id: "namespaces.parent.namespace.v2",
    label: "ns-v2",
    cases: ["N15"],
    tags: { namespace: "namespace", chain: "8453", resolver: "v2" },
    resolver: "namespaces.namespace.hybridResolver.v2",
    // Route 2 is Base, as on mainnet. `setNameRoute` also takes the DNS-encoded name, an
    // overload viem cannot tell from this one.
    configure: (c, node, owner) =>
      Effect.gen(function* () {
        const resolver = yield* c.address("namespaces.namespace.hybridResolver.v2");
        yield* c.write(
          [resolver, parseAbi(["function setNameRoute(bytes32 node, uint256 id)"])],
          "setNameRoute",
          [node, 2n],
          { from: owner },
        );
      }),
  }),
];
