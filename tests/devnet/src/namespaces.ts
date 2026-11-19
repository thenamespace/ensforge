import type { Deployments } from "@ensforge/contracts";

import type { DevnetInstance, L2Instance } from "./Devnet.ts";
import type { L2ProfileName } from "./profiles/profiles.ts";

/** Seconds of Basenames' and Linea Names' grace period, as on mainnet. */
const ninetyDays = 7_776_000;

/**
 * The L2 namespaces of a devnet (`mainnet-shaped` or `v2-only`) running next to its L2s: what
 * `Deployments.Profile.namespaces` holds for it, as `Deployments.mainnet.namespaces` does for
 * mainnet. Durin is deployed on Base only.
 */
export const namespacesOf = (
  devnet: Pick<DevnetInstance, "contract" | "deployments">,
  l2s: { readonly [profile in L2ProfileName]: Pick<L2Instance, "chainId" | "contract"> },
): Deployments.Namespaces => {
  const ensChainId = devnet.deployments.chainId;
  const { "l2-base": base, "l2-optimism": optimism, "l2-linea": linea, "l2-celo": celo } = l2s;

  return {
    basenames: {
      parent: "base.eth",
      ensChainId,
      chainId: base.chainId,
      l1Resolver: devnet.contract("namespaces.basenames.l1Resolver"),
      gracePeriod: ninetyDays,
      contracts: {
        registry: base.contract("basenames.registry"),
        baseRegistrar: base.contract("basenames.baseRegistrar"),
        resolver: base.contract("basenames.resolver"),
        legacyResolver: base.contract("basenames.legacyResolver"),
      },
    },
    linea: {
      parent: "linea.eth",
      ensChainId,
      chainId: linea.chainId,
      l1Resolver: devnet.contract("namespaces.linea.l1Resolver"),
      gracePeriod: ninetyDays,
      contracts: {
        registry: linea.contract("linea.registry"),
        baseRegistrar: linea.contract("linea.baseRegistrar"),
        nameWrapper: linea.contract("linea.nameWrapper"),
        resolver: linea.contract("linea.resolver"),
      },
    },
    celonames: {
      parent: "celo.eth",
      ensChainId,
      chainId: celo.chainId,
      l1Resolver: devnet.contract("namespaces.celonames.l1Resolver"),
      gracePeriod: 0,
      contracts: { registry: celo.contract("celonames.registry") },
    },
    durin: {
      ensChainId,
      l1Resolver: devnet.contract("namespaces.durin.l1Resolver"),
      factory: base.contract("durin.factory"),
      registryImplementation: base.contract("durin.registryImplementation"),
      chainIds: [base.chainId],
    },
    namespace: {
      ensChainId,
      hybridResolvers: {
        current: devnet.contract("namespaces.namespace.hybridResolver.current"),
        previous: devnet.contract("namespaces.namespace.hybridResolver.previous"),
        v2: devnet.contract("namespaces.namespace.hybridResolver.v2"),
      },
      routes: { 2: base.chainId, 3: optimism.chainId },
      chains: {
        [base.chainId]: {
          nodeRegistryResolver: base.contract("namespace.nodeRegistryResolver"),
          publicResolver: base.contract("namespace.publicResolver"),
        },
        [optimism.chainId]: {
          nodeRegistryResolver: optimism.contract("namespace.nodeRegistryResolver"),
          publicResolver: optimism.contract("namespace.publicResolver"),
        },
      },
    },
  };
};
