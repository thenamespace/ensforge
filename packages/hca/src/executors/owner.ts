import type { Executor } from "../types.js";

/**
 * The owner's wallet sends each HCA execution as an `executeByOwner` transaction. The default
 * executor; needs no service.
 *
 * **When to use**
 *
 * Use when the owner pays gas: one transaction per execution, or one EIP-5792 bundle for the
 * whole write with a wallet that supports it.
 *
 * **Details**
 *
 * - Deploys the HCA with a factory call in the first step when needed.
 * - With `paymaster` on the write, an EIP-5792 wallet can sponsor the transactions.
 *
 * **Example** (Explicitly)
 *
 * ```ts
 * import { hca, owner } from "@ensforge/hca"
 *
 * await ens.hca.executeSync({ calls, via: hca({ executors: [owner()] }) })
 * ```
 *
 * **Example** (Choosing the executor)
 *
 * ```ts
 * import { hca, owner, pimlico } from "@ensforge/hca"
 *
 * // `hca()` uses the first executor only, so choose one per request.
 * const gasless = true
 * const via = gasless ? hca({ executors: [pimlico({ apiKey })] }) : hca({ executors: [owner()] })
 * ```
 *
 * **Example** (Sponsored by the wallet)
 *
 * ```ts
 * import { hca } from "@ensforge/hca"
 *
 * await ens.migration.migrate({ names, via: hca(), paymaster: { url: paymasterUrl } })
 * ```
 *
 * @stability experimental
 * @category executors
 * @since 1.0.0
 */
export const owner = (): Executor => ({
  id: "owner",
  capabilities: { sessions: false, sponsorship: false, deploys: false },
});
