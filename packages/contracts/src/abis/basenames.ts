/**
 * Basenames (`base.eth`) ABIs from base/basenames, keyed by contract.
 *
 * @since 1.1.0
 */
export { basenamesBaseRegistrarAbi as baseRegistrar } from "../namespaces/basenames/base-registrar.js";
export { basenamesL2ResolverAbi as l2Resolver } from "../namespaces/basenames/l2-resolver.js";

/**
 * Interface ABIs: only the functions ensforge reads, for small bundles.
 *
 * @stability stable
 */
export * as interfaces from "./basenames-interfaces.js";
