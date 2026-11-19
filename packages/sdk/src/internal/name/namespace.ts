import { Effect } from "effect";

import type { NameNamespace } from "../../actions/name/get/types.js";
import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import { remembered } from "../namespace/cache.js";
import type { ServingResolver } from "../resolver/serving.js";
import type { NameParts } from "./parts.js";
import { probeServed, type ServedKind } from "./served.js";

/** How a name no registry holds is served, and the namespace that holds it. */
export type ServedNamespace = {
  /** `l2` for a name in an L2 namespace; otherwise how the resolver serves it, if at all. */
  readonly kind: ServedKind | "l2" | null;
  readonly namespace: NameNamespace | null;
};

/**
 * Where a name no registry holds lives, from the ancestor's resolver that serves it: an L2
 * namespace (no probe needed), or, when the resolver serves it through a gateway, the off-chain
 * provider (`null` when unknown). Remembered per client for a minute; the locator is loaded only
 * here, so reading ENS names costs no bundle for it.
 */
export const servedNamespace = (
  client: Client,
  parts: NameParts,
  served: ServingResolver,
  block: Read.BlockOptions,
): Effect.Effect<ServedNamespace, AnyError> =>
  remembered(
    client,
    `${parts.name}@${served.address}`,
    block.blockNumber === undefined && block.blockTag === undefined,
    Effect.gen(function* () {
      const { locate } = yield* Effect.promise(() => import("../namespace/locate.js"));
      const located = yield* locate(client, parts, served, block);
      if (located?.kind === "l2") return { kind: "l2", namespace: located };

      const kind = yield* probeServed(client, parts, served.address, block);
      return kind === "offchain"
        ? {
            kind,
            namespace: located ?? { kind: "offchain", provider: null, parent: served.level },
          }
        : { kind, namespace: null };
    }),
  );
