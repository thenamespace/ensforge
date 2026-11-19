/**
 * Durin ABIs from ensdomains/durin, keyed by contract.
 *
 * @since 1.1.0
 */
export { durinL1ResolverAbi as l1Resolver } from "../namespaces/durin/l1-resolver.js";
export { durinL2RegistryAbi as l2Registry } from "../namespaces/durin/l2-registry.js";

/**
 * Durin interface ABIs: only the functions ensforge reads, for small bundles.
 *
 * @stability experimental
 */
export * as interfaces from "./durin-interfaces.js";
