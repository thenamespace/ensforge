import { Effect } from "effect";

import { zeroAddress, type Address } from "viem";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { LoadedName } from "../name/load.js";

/** Where a Basenames or Linea name's delegates live: its resolver on its L2 and its owner there. */
export type L2Delegates = {
  readonly client: Client;
  readonly resolver: Address | null;
  /** The owner the resolver authorizes, under whom delegates are kept. */
  readonly owner: Address | null;
};

/**
 * For a name ENS does not hold, its delegates on its L2, or `null` for names in ENS. Names of
 * families without resolver delegates are refused, saying where they live. As on ENS, the name
 * need not be registered.
 */
export const l2DelegateTarget = Effect.fnUntraced(function* (
  client: Client,
  loaded: LoadedName,
): Effect.fn.Return<L2Delegates | null, AnyError> {
  if (loaded.kind !== "available") return null;
  const { l2ReadTarget, l2RefusalAt } = yield* Effect.promise(() => import("../name/location.js"));
  const l2 = yield* l2ReadTarget(client, loaded.data.parts, {}, true);
  if (l2 === null) return null;

  const { forkContractsOf, forkControl, l2ResolverOf } = yield* Effect.promise(
    () => import("../namespace/l2/index.js"),
  );
  const contracts = forkContractsOf(l2.client, l2.location);
  if (contracts === null) {
    return yield* Effect.fail(l2RefusalAt(l2.client, l2.location, loaded.data.parts));
  }
  const [resolver, control] = yield* Effect.all(
    [
      l2ResolverOf(l2.client, l2.location, loaded.data.parts),
      // The owner alone matters here, not any account's authority.
      forkControl(l2.client, contracts, loaded.data.parts, zeroAddress),
    ],
    { concurrency: "unbounded" },
  );
  return { client: l2.client, resolver, owner: control.owner };
});
