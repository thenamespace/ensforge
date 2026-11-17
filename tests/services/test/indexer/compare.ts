import { Effect, Result } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import type { ensforge } from "@ensforge/test-integration/support/chain";
import { isAddressEqual, type Address } from "viem";

const same = (a: Address | null | undefined, b: Address | null | undefined) =>
  a === null || a === undefined || b === null || b === undefined
    ? (a ?? null) === (b ?? null)
    : isAddressEqual(a, b);

/**
 * The indexer statuses that describe a chain status: bigname calls a registration that ended
 * `released` (also once it was unregistered), and keeps `expired` for the window before that.
 */
const statusesFor: Readonly<Record<string, readonly string[]>> = {
  registered: ["active"],
  grace: ["active", "expired"],
  expired: ["expired", "released"],
  available: ["released", "unregistered"],
  reserved: ["active"],
};

/** One difference, and why it is expected when it is a known bigname behaviour. */
export type Difference = { readonly entry: string; readonly known?: string };

/**
 * How bigname's answer for `name` differs from the chain's at the block bigname indexed, one
 * `label: field …` entry per difference.
 */
export const nameDifferences = Effect.fnUntraced(function* (
  ens: ReturnType<typeof ensforge>,
  label: string,
  name: string,
) {
  const found: Difference[] = [];
  const answer = yield* Effect.result(Actions.indexer.getName(ens, { name }));
  if (Result.isFailure(answer)) {
    found.push({ entry: `${label}: indexer error ${answer.failure.code}` });
    return found;
  }
  const indexed = answer.success;
  const block = indexed?.asOf?.blockNumber;
  const read = yield* Effect.result(
    Actions.name.get(ens, {
      name,
      ...(block === undefined ? {} : { blockNumber: block }),
    }),
  );
  if (Result.isFailure(read)) {
    found.push({ entry: `${label}: chain error ${read.failure.code}` });
    return found;
  }
  const state = read.success;
  if (indexed === null) {
    if (state.status !== "available") found.push({ entry: `${label}: not indexed` });
    return found;
  }
  if (!(statusesFor[state.status] ?? []).includes(indexed.status ?? "")) {
    const v2Grace =
      state.status === "grace" && indexed.authority === "ensV2" && indexed.status === "released";
    const parent = name.split(".").slice(1).join(".");
    const at = block === undefined ? {} : { blockNumber: block };
    // A child the chain no longer reaches: its ENSv2 parent expired (children go at expiry, grace
    // included), or was registered again, which creates a new resource without the old children.
    const orphan =
      state.status === "available" &&
      indexed.status === "active" &&
      parent.includes(".") &&
      (["grace", "expired", "available"].includes(
        (yield* Actions.name.get(ens, { name: parent, ...at })).status,
      ) ||
        ((yield* Actions.indexer.getName(ens, { name: parent }))?.registeredAt ?? 0n) >
          (indexed.registeredAt ?? 0n));
    const releasedReservation =
      state.status === "grace" &&
      !state.reachable &&
      indexed.authority === "ensV1" &&
      indexed.status === "released";
    const known = v2Grace
      ? "bigname gives ENSv2 names no grace period; ETHRegistrar renews through GRACE_PERIOD."
      : releasedReservation
        ? "An ENSv1 name in grace whose ENSv2 reservation was released: bigname reports the release, ensforge the registrar's grace (unreachable)."
        : orphan
          ? "bigname keeps a subname active after its ENSv2 parent expires or is registered again; the chain no longer reaches it."
          : undefined;
    found.push({
      entry: `${label}: status ${indexed.status}, chain ${state.status}`,
      ...(known === undefined ? {} : { known }),
    });
  }
  if (!same(indexed.owner, state.owner)) {
    // In grace the registrar token has no holder, so the chain names neither owner nor registrant.
    const graceRegistrant = state.status === "grace" && state.owner === null;
    found.push({
      entry: `${label}: owner ${indexed.owner}, chain ${state.owner}`,
      ...(graceRegistrant
        ? {
            known:
              "A registrar token has no holder once it expires; bigname keeps the registrant through grace.",
          }
        : {}),
    });
  }
  // While ENSv1 decides a name, its registry resolver and registrar expiry are ENSv1
  // facts; the top-level fields describe what ENSv2 serves (the reservation).
  const v1 = indexed.authority === "ensV1" || indexed.authority === "ensV0";
  const resolver = v1 ? indexed.ensV1?.resolver?.address : indexed.resolver?.address;
  if (!same(resolver, state.resolver)) {
    found.push({ entry: `${label}: resolver ${resolver}, chain ${state.resolver}` });
  }
  // Subnames have no registrar lease; their NameWrapper expiry is the top-level one.
  const expiry = (v1 ? indexed.ensV1?.expiresAt : undefined) ?? indexed.expiresAt;
  if (state.expiry !== null && expiry !== state.expiry) {
    found.push({ entry: `${label}: expiry ${expiry}, chain ${state.expiry}` });
  }
  return found;
});
