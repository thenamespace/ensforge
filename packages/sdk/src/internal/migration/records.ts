import { Effect } from "effect";

import type { NameInput } from "../../actions/migration/types.js";
import type { Client } from "../../client/types.js";
import { MigrationError } from "../../errors/classes/MigrationError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import * as CoinType from "../../utils/CoinType.js";
import { callIndexer } from "../indexer/call.js";
import { readRecords } from "../records/read.js";
import type { RecordWrites } from "../records/write-profiles.js";

/** Records to copy, as `record.set` takes them. */
export type CopiedRecords = Omit<RecordWrites, "clear" | "pubkey">;

// ENSIP-5 global keys, ENSIP-18 profile keys and the common service keys.
const commonTexts = [
  "avatar",
  "header",
  "display",
  "description",
  "email",
  "url",
  "location",
  "keywords",
  "notice",
  "phone",
  "name",
  "timezone",
  "pgp",
  "com.twitter",
  "com.x",
  "com.github",
  "com.discord",
  "com.reddit",
  "com.linkedin",
  "com.youtube",
  "org.telegram",
  "xyz.farcaster",
  "io.keybase",
  "org.matrix",
];

// Bitcoin, Litecoin, Dogecoin, Solana, then EVM chains (ENSIP-11) and the default EVM address.
const defaultEvm = 0x80000000n;
const commonCoins = [
  60n,
  0n,
  2n,
  3n,
  501n,
  ...[10, 137, 324, 8453, 42161, 59144, 534352].map(CoinType.fromChainId),
  defaultEvm,
];

/**
 * The texts, addresses and content hash `name` resolves to now, as records to copy. Unset keys
 * are skipped; EVM chains that only fall back to the default EVM address are copied once.
 */
const readCopy = Effect.fnUntraced(function* (
  client: Client,
  name: string,
  selection: {
    readonly texts: readonly string[];
    readonly addresses: readonly bigint[];
    readonly contentHash: boolean;
  },
): Effect.fn.Return<CopiedRecords, AnyError> {
  const read = yield* readRecords(client, {
    name,
    selection: {
      texts: selection.texts,
      addresses: selection.addresses,
      ...(selection.contentHash ? { contentHash: true } : {}),
    },
  });

  const texts = Object.fromEntries(
    Object.entries(read.texts ?? {}).filter(
      (entry): entry is [string, string] => entry[1] !== null,
    ),
  );
  const fallback = read.addresses?.[String(defaultEvm)] ?? null;
  const addresses = Object.fromEntries(
    Object.entries(read.addresses ?? {}).filter(
      (entry): entry is [string, string] =>
        entry[1] !== null &&
        (entry[0] === String(defaultEvm) ||
          entry[0] === "60" ||
          !CoinType.isEvm(BigInt(entry[0])) ||
          entry[1] !== fallback),
    ),
  );

  return {
    ...(Object.keys(texts).length > 0 ? { texts } : {}),
    ...(Object.keys(addresses).length > 0 ? { addresses } : {}),
    ...(read.contentHash === null || read.contentHash === undefined
      ? {}
      : { contentHash: read.contentHash.uri }),
  };
});

/** Record keys the indexer has seen for a name, split into what migration can copy. */
export type RecordInventory = {
  readonly texts: readonly string[];
  readonly addresses: readonly bigint[];
  readonly contentHash: boolean;
  /** Keys that are not copied: ABIs, public keys, interfaces, data records. */
  readonly skipped: readonly string[];
  /** Whether the indexer listed every key (`false` when it reported keys it cannot read). */
  readonly complete: boolean;
};

/**
 * Every record key `name` has set, from the client's indexer; `null` without an indexer or when
 * the indexer does not know the name.
 */
export const recordInventory = Effect.fnUntraced(function* (
  client: Client,
  name: string,
): Effect.fn.Return<RecordInventory | null, AnyError> {
  if (client.config.indexer === undefined) return null;

  const result = yield* callIndexer(client, "getRecords", {
    name,
    namespace: "ens",
    values: false,
  });
  if (result === null || result.inventory === null) return null;

  const texts: string[] = [];
  const addresses: bigint[] = [];
  const skipped: string[] = [];
  let contentHash = false;
  for (const key of result.inventory.keys) {
    if (key.startsWith("text:")) texts.push(key.slice(5));
    else if (key.startsWith("addr:") && /^\d+$/.test(key.slice(5)))
      addresses.push(BigInt(key.slice(5)));
    else if (key === "contenthash") contentHash = true;
    else skipped.push(key);
  }
  return {
    texts,
    addresses,
    contentHash,
    skipped,
    complete: result.completeness === "full" && result.inventory.unsupportedKeys.length === 0,
  };
});

/**
 * The records to write on a name's new resolver, from the first source that applies:
 *
 * 1. the caller's `records`;
 * 2. the indexer's record inventory, with every value read on-chain (warns about keys it cannot
 *    copy or did not list);
 * 3. with `allowIncompleteRecords`, the common keys (with a warning).
 *
 * Otherwise a name whose resolver holds records fails with `RECORDS_UNKNOWN`: copying nothing
 * would leave its profile behind on a resolver nobody can edit any more.
 */
export const recordsToCopy = Effect.fnUntraced(function* (
  client: Client,
  input: Exclude<NameInput, string> | undefined,
  name: string,
  options: { readonly hasRecords: boolean; readonly allowIncomplete: boolean },
): Effect.fn.Return<
  { readonly records: CopiedRecords | undefined; readonly warnings: readonly Plan.Warning[] },
  AnyError
> {
  if (input?.records !== undefined) return { records: input.records, warnings: [] };
  if (!options.hasRecords) return { records: undefined, warnings: [] };

  const inventory = yield* recordInventory(client, name);
  if (inventory !== null) {
    const warnings: Plan.Warning[] = [];
    if (inventory.skipped.length > 0) {
      warnings.push({
        code: "RECORDS_NOT_COPIED",
        message: `${name}'s ${inventory.skipped.join(", ")} records are not copied; they stay on its ENSv1 resolver.`,
      });
    }
    if (!inventory.complete) {
      warnings.push({
        code: "RECORDS_MAY_BE_INCOMPLETE",
        message: `The indexer could not list every record of ${name}; check its new profile.`,
      });
    }
    return { records: yield* readCopy(client, name, inventory), warnings };
  }

  if (!options.allowIncomplete) {
    return yield* Effect.fail(
      new MigrationError({
        code: "RECORDS_UNKNOWN",
        shortMessage: `The records of ${name} are not known, so they cannot be copied.`,
        hint: 'Configure an indexer, pass the name\'s records, keep its resolver (`resolver: "keep"`), or pass `allowIncompleteRecords` to copy the common ones.',
      }),
    );
  }
  return {
    records: yield* readCopy(client, name, {
      texts: commonTexts,
      addresses: commonCoins,
      contentHash: true,
    }),
    warnings: [
      {
        code: "RECORDS_MAY_BE_INCOMPLETE",
        message: `Only the common records of ${name} are copied; others stay on its ENSv1 resolver.`,
      },
    ],
  };
});
