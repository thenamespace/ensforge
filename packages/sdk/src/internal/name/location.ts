import { Effect } from "effect";

import { Deployments } from "@ensforge/contracts";

import type { NameNamespace, NameStatus } from "../../actions/name/get/types.js";
import type { Client } from "../../client/types.js";
import { ConfigError } from "../../errors/classes/ConfigError.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import { remembered } from "../namespace/cache.js";
import { servingResolver } from "../resolver/serving.js";
import * as Rpc from "../rpc/index.js";
import { chainClient, hasChain } from "../write/chain.js";
import type { NameParts } from "./parts.js";

/** A name in an L2 namespace. */
export type L2Location = Extract<NameNamespace, { readonly kind: "l2" }>;

/**
 * The L2 namespace a name lives in, or `null` for names in ENS and off-chain ones: a parent's
 * resolver (behind the ENSv1 bridge too) that belongs to one of the deployment's namespaces. Reads
 * call it next to their ENS reads; it costs one `findResolver` in the same multicall round, and the
 * locator loads only for names such a resolver serves. Remembered per client for a minute.
 */
export const l2LocationOf = (
  client: Client,
  parts: NameParts,
  block: Read.BlockOptions,
): Effect.Effect<L2Location | null, AnyError> =>
  remembered(
    client,
    `l2:${parts.name}`,
    block.blockNumber === undefined && block.blockTag === undefined,
    Effect.gen(function* () {
      const found = yield* Rpc.findResolver(client, { ...block, name: parts.name });
      if (found === null || !found.inherited) return null;
      const served = yield* servingResolver(client, parts.name, found, block);
      if (served === null || !served.inherited) return null;
      if (
        Deployments.namespaceOf({ profile: client.deployment, resolver: served.address }) ===
        undefined
      )
        return null;

      const { locate } = yield* Effect.promise(() => import("../namespace/locate.js"));
      const located = yield* locate(client, parts, served, block);
      return located?.kind === "l2" ? located : null;
    }),
  );

/**
 * The client to read an L2 name on, or `null` when the client cannot reach its chain: reads then
 * fall back to Ethereum, and `strict` reads fail with `CHAIN_NOT_CONFIGURED`.
 */
export const l2Client = (
  client: Client,
  location: L2Location,
  strict: boolean | undefined,
): Effect.Effect<Client | null, ConfigError> =>
  hasChain(client, location.chainId)
    ? chainClient(client, location.chainId)
    : strict === true
      ? Effect.fail(
          new ConfigError({ code: "CHAIN_NOT_CONFIGURED", context: { chainId: location.chainId } }),
        )
      : Effect.succeed(null);

/**
 * The status of a name on its L2, or `null` for names in ENS and ones on an L2 the client cannot
 * reach.
 */
export const l2StatusOf = Effect.fnUntraced(function* (
  client: Client,
  parts: NameParts,
): Effect.fn.Return<NameStatus | null, AnyError> {
  const location = yield* l2LocationOf(client, parts, {});
  const l2 = location === null ? null : yield* l2Client(client, location, false);
  if (location === null || l2 === null) return null;
  const { readL2State } = yield* Effect.promise(() => import("../namespace/l2/index.js"));
  const state = yield* readL2State(l2, location, parts);
  return state.status;
});

/**
 * Where to read a name's records: its L2 and a client there, or `null` to read it through
 * Ethereum (a name in ENS, one the locator cannot place, or an L2 the client cannot reach unless
 * `strict`, which fails with `CHAIN_NOT_CONFIGURED`).
 */
export const l2ReadTarget = (
  client: Client,
  parts: NameParts,
  block: Pick<Read.BlockOptions, "blockTag">,
  strict: boolean | undefined,
): Effect.Effect<{ readonly location: L2Location; readonly client: Client } | null, AnyError> =>
  // A name that cannot be located is read through Ethereum, which reports what went wrong.
  l2LocationOf(client, parts, block).pipe(
    Effect.orElseSucceed(() => null),
    Effect.flatMap((location) =>
      location === null
        ? Effect.succeed(null)
        : l2Client(client, location, strict).pipe(
            Effect.map((l2) => (l2 === null ? null : { location, client: l2 })),
          ),
    ),
  );
