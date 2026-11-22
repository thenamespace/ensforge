import { Array as Arr, Effect } from "effect";

import { Abis, Roles } from "@ensforge/contracts";
import { encodeFunctionData, isAddressEqual, type Address } from "viem";

import type { Client } from "../../client/types.js";
import { ConfigError } from "../../errors/classes/ConfigError.js";
import { IndexerError } from "../../errors/classes/IndexerError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import { callIndexer } from "../indexer/call.js";
import * as Rpc from "../rpc/index.js";

/** Role bits only, without their admin bits (EnhancedAccessControl keeps admins 128 bits up). */
const roleBits = (1n << 128n) - 1n;
const nybbles = Arr.makeBy(64, (index) => BigInt(index * 4));

/** One bit per role at least one account other than `owner` holds, from the assignee counts. */
const othersHold = (counts: bigint, ownerRoles: bigint): bigint =>
  Arr.reduce(nybbles, 0n, (held, shift) => {
    const count = (counts >> shift) & 0xfn;
    const owner = (ownerRoles >> shift) & 1n;
    return count > owner ? held | (1n << shift) : held;
  });

/** The token ID after `regenerations` role changes bump its version (its low 32 bits). */
export const regeneratedTokenId = (tokenId: bigint, regenerations: number): bigint =>
  (tokenId & ~0xffffffffn) | (((tokenId & 0xffffffffn) + BigInt(regenerations)) & 0xffffffffn);

/** Roles others hold on a name, and the revocations that remove them before a transfer. */
export type Delegates = {
  /** Roles at least one account other than the owner holds (one bit each). */
  readonly retained: bigint;
  /** `revokeRoles` calls, in order, to send before the move. */
  readonly revokes: readonly Plan.Call[];
  /** How many of them regenerate the token, bumping its ID's version. */
  readonly regenerations: number;
};

/**
 * Who else holds roles on a v2 name, from its assignee counts (no indexer needed). With `revoke`,
 * the indexer nominates the holders, each is checked on chain, and together they must account for
 * every count; the sender revokes what its admin roles allow, and anything left is `retained`.
 */
export const delegatesOf = Effect.fnUntraced(function* (
  client: Client,
  options: {
    readonly name: string;
    readonly registry: Address;
    readonly resource: bigint;
    readonly tokenId: bigint;
    readonly owner: Address;
    readonly sender: Address;
    readonly revoke: boolean;
  },
): Effect.fn.Return<Delegates, AnyError> {
  const read = { address: options.registry, abi: Abis.v2.permissionedRegistry } as const;
  const rolesOf = (account: Address, resource = options.resource) =>
    Rpc.readContract(client, { ...read, functionName: "roles", args: [resource, account] });
  const { counts, ownerRoles } = yield* Effect.all(
    {
      counts: Rpc.readContract(client, {
        ...read,
        functionName: "getAssigneeCount",
        args: [options.resource, Roles.enhancedAccessControl.allRoles & roleBits],
      }).pipe(Effect.map(([count]) => count)),
      ownerRoles: rolesOf(options.owner),
    },
    { concurrency: "unbounded" },
  );
  const retained = othersHold(counts, ownerRoles & roleBits);
  if (retained === 0n || !options.revoke) return { retained, revokes: [], regenerations: 0 };

  if (client.config.indexer === undefined) {
    return yield* Effect.fail(
      new ConfigError({
        code: "INDEXER_NOT_CONFIGURED",
        shortMessage: "Finding who holds roles on the name needs an indexer.",
        hint: 'Configure an indexer, or transfer with `delegates: "keep"`.',
      }),
    );
  }
  const candidates: Address[] = [];
  let cursor: string | undefined;
  do {
    const page = yield* callIndexer(client, "getPermissions", {
      name: options.name,
      limit: 200,
      cursor,
    });
    for (const row of page.items) {
      if (
        !isAddressEqual(row.address, options.owner) &&
        !Arr.some(candidates, (known) => isAddressEqual(known, row.address))
      ) {
        candidates.push(row.address);
      }
    }
    cursor = page.hasMore && page.cursor !== null ? page.cursor : undefined;
  } while (cursor !== undefined);

  // The indexer only nominates: each holder's roles are read on chain, and they must add up.
  const held = yield* Effect.forEach(candidates, (account) => rolesOf(account), {
    concurrency: "unbounded",
  });
  const verified = Arr.reduce(
    held,
    0n,
    (total, roles) => total + (roles & roleBits & Roles.enhancedAccessControl.allRoles),
  );
  const expected = Arr.reduce(nybbles, 0n, (total, shift) => {
    const count = (counts >> shift) & 0xfn;
    const owner = (ownerRoles >> shift) & 1n;
    return count > owner ? total + ((count - owner) << shift) : total;
  });
  if (verified !== expected) {
    return yield* Effect.fail(
      new IndexerError({
        code: "INDEXER_BEHIND",
        shortMessage: `The indexer does not list every account holding roles on ${options.name}.`,
        hint: 'Retry once the indexer catches up, or transfer with `delegates: "keep"`.',
      }),
    );
  }

  // The sender revokes the roles whose admin it holds, on the name or at the registry's root.
  const { senderRoles, senderRoot } = yield* Effect.all(
    { senderRoles: rolesOf(options.sender), senderRoot: rolesOf(options.sender, 0n) },
    { concurrency: "unbounded" },
  );
  const revocable = ((senderRoles | senderRoot) >> 128n) & roleBits;
  const revokes: Plan.Call[] = [];
  let regenerations = 0;
  let left = 0n;
  for (const [index, account] of candidates.entries()) {
    const roles = (held[index] ?? 0n) & roleBits;
    const revoked = roles & revocable;
    left |= roles & ~revocable;
    if (revoked === 0n) continue;
    revokes.push({
      to: options.registry,
      data: encodeFunctionData({
        ...read,
        functionName: "revokeRoles",
        args: [options.tokenId, revoked, account],
      }),
      value: 0n,
    });
    if ((revoked & Roles.registryBitmaps.regeneration) !== 0n) regenerations += 1;
  }
  return { retained: left, revokes, regenerations };
});
