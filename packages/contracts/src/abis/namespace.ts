/**
 * Namespace L2 subname ABIs from thenamespace/contracts, keyed by contract.
 *
 * @since 1.1.0
 */
export { namespaceEnsNameRegistryAbi as ensNameRegistry } from "../namespaces/namespace/ens-name-registry.js";
export { namespaceHybridResolverAbi as hybridResolver } from "../namespaces/namespace/hybrid-resolver.js";
export { namespaceHybridResolverV2Abi as hybridResolverV2 } from "../namespaces/namespace/hybrid-resolver-v2.js";
export { namespacePublicResolverAbi as namePublicResolver } from "../namespaces/namespace/name-public-resolver.js";
export { namespaceNodeRegistryResolverAbi as nodeRegistryResolver } from "../namespaces/namespace/node-registry-resolver.js";

/**
 * Namespace interface ABIs: only the functions ensforge reads, for small bundles.
 *
 * @stability stable
 */
export * as interfaces from "./namespace-interfaces.js";
