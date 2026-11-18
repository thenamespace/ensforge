import type { Executor } from "../types.js";

/**
 * Builds an executor from your own functions, e.g. for another bundler SDK or a relayer.
 *
 * **When to use**
 *
 * Use when none of the built-in executors fits: `send` runs one HCA execution and returns a
 * reference, `status` reports it.
 *
 * **Details**
 *
 * - Requests carry the HCA, its owner, whether it is deployed, the calls and the session if any.
 * - Return `{ status: "failed" }` without hashes for executions that never landed: the write can
 *   send them again.
 *
 * **Example** (A relayer)
 *
 * ```ts
 * import { defineExecutor } from "@ensforge/hca"
 *
 * const relayer = defineExecutor({
 *   id: "relayer",
 *   capabilities: { sessions: false, sponsorship: true, deploys: false },
 *   send: async (request) => api.relay(request),
 *   status: async (id) => api.status(id),
 * })
 * ```
 *
 * **Example** (Used first, wallet as fallback)
 *
 * ```ts
 * import { hca, owner } from "@ensforge/hca"
 *
 * const via = hca({ executors: [relayer, owner()] })
 * ```
 *
 * **Example** (A test double)
 *
 * ```ts
 * import { defineExecutor } from "@ensforge/hca"
 *
 * const fake = defineExecutor({ id: "fake", capabilities, send: async () => "1", status: async () => ({ status: "success", hashes: [hash] }) })
 * ```
 *
 * @stability experimental
 * @category executors
 * @since 1.0.0
 */
export const defineExecutor = (executor: Executor): Executor => Object.freeze({ ...executor });
