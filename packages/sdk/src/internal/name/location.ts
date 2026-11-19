import { Effect } from "effect";

import { Deployments } from "@ensforge/contracts";

import type { NameNamespace } from "../../actions/name/get/types.js";
import { stateOf } from "../../client/state.js";
import type { Client } from "../../client/types.js";
import { ConfigError } from "../../errors/classes/ConfigError.js";
import { NameStateError } from "../../errors/classes/NameStateError.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import { remembered } from "../namespace/cache.js";
import type { L2State } from "../namespace/l2/index.js";
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
 * What a name's L2 holds about it, or `null` for names in ENS and ones on an L2 the client cannot
 * reach.
 */
export const l2StateOf = Effect.fnUntraced(function* (
  client: Client,
  parts: NameParts,
): Effect.fn.Return<L2State | null, AnyError> {
  const location = yield* l2LocationOf(client, parts, {});
  const l2 = location === null ? null : yield* l2Client(client, location, false);
  if (location === null || l2 === null) return null;
  const { readL2State } = yield* Effect.promise(() => import("../namespace/l2/index.js"));
  return yield* readL2State(l2, location, parts);
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

/** A registered L2 name a write reaches: where it lives, a client on its L2 and its state there. */
export type L2WriteTarget = {
  readonly location: L2Location;
  readonly client: Client;
  readonly state: L2State;
};

const familyNames: Record<Deployments.NamespaceId, string> = {
  basenames: "Basenames",
  linea: "Linea Names",
  celonames: "Celonames",
  durin: "Durin",
  namespace: "Namespace",
};

/** Where an L2 name lives, for messages: "Base (chain 8453) in Basenames". */
const placeOf = (client: Client, location: L2Location): string => {
  const chain = stateOf(client)?.clientOf(location.chainId)?.chain?.name;
  const id = `chain ${location.chainId}`;
  return `${chain === undefined ? id : `${chain} (${id})`} in ${familyNames[location.id]}`;
};

/**
 * The L2 a write on a name ENS does not hold goes to, or `null` for names in no L2 namespace.
 * Writes never fall back to Ethereum: an L2 the client cannot reach fails with
 * `CHAIN_NOT_CONFIGURED`, and a name its L2 does not hold as registered fails as an ENS name would.
 */
export const l2WriteTarget = Effect.fnUntraced(function* (
  client: Client,
  parts: NameParts,
): Effect.fn.Return<L2WriteTarget | null, AnyError> {
  const location = yield* l2LocationOf(client, parts, {});
  if (location === null) return null;
  const l2 = yield* l2Client(client, location, true);
  if (l2 === null) return null;

  const { readL2State } = yield* Effect.promise(() => import("../namespace/l2/index.js"));
  const state = yield* readL2State(l2, location, parts);
  const context = { chainId: location.chainId };
  switch (state.status) {
    case "registered":
      return { location, client: l2, state };
    case "grace":
    case "expired":
      return yield* Effect.fail(
        new NameStateError({
          code: "NAME_EXPIRED",
          shortMessage: `${parts.name} has expired on ${placeOf(client, location)}.`,
          hint: "Renew it with its namespace's app.",
          context,
        }),
      );
    default:
      return yield* Effect.fail(
        new NameStateError({
          code: "NAME_NOT_REGISTERED",
          shortMessage: `${parts.name} is not registered on ${placeOf(client, location)}.`,
          context,
        }),
      );
  }
});

// What ensforge writes on each family's names; ENSv1 forks take ENS's registry calls too.
const writable = (location: L2Location): string =>
  location.id === "basenames" || location.id === "linea"
    ? "its records, resolver, TTL, subnames, owner and approvals"
    : "its records, owner and approvals";

/** `NAME_EXTERNAL` for a write ensforge does not make on an L2 name, naming where it lives. */
export const l2RefusalAt = (
  client: Client,
  location: L2Location,
  parts: NameParts,
): NameStateError =>
  new NameStateError({
    code: "NAME_EXTERNAL",
    shortMessage: `${parts.name} lives on ${placeOf(client, location)}. ensforge can change ${writable(location)}, not this.`,
    hint: "Use the namespace's own app for anything else.",
    context: {
      name: parts.name,
      chainId: location.chainId,
      ...(location.registry === null ? {} : { contract: location.registry }),
    },
  });

/**
 * `NAME_EXTERNAL` for a write ensforge does not make on L2 names, or `null` for names in no L2
 * namespace. A name that cannot be located is left to the caller.
 */
export const l2Refusal = (
  client: Client,
  parts: NameParts,
): Effect.Effect<NameStateError | null, AnyError> =>
  l2LocationOf(client, parts, {}).pipe(
    Effect.orElseSucceed(() => null),
    Effect.map((location) => (location === null ? null : l2RefusalAt(client, location, parts))),
  );
