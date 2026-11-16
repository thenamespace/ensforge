import { Effect } from "effect";

import type { NameInput } from "../../actions/migration/types.js";
import type { Client } from "../../client/types.js";
import { MigrationError } from "../../errors/classes/MigrationError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import * as CoinType from "../../utils/CoinType.js";
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

/** The common records `name` resolves to now, for `allowIncompleteRecords`. */
const commonRecords = Effect.fnUntraced(function* (
  client: Client,
  name: string,
): Effect.fn.Return<CopiedRecords, AnyError> {
  const read = (yield* readRecords(client, {
    name,
    selection: { texts: commonTexts, addresses: commonCoins, contentHash: true },
  })) as {
    readonly texts?: Readonly<Record<string, string | null>>;
    readonly addresses?: Readonly<Record<string, string | null>>;
    readonly contentHash?: { readonly uri: string } | null;
  };

  const texts = Object.fromEntries(
    Object.entries(read.texts ?? {}).filter(
      (entry): entry is [string, string] => entry[1] !== null,
    ),
  );
  // EVM chains without their own record read the default address; that one is copied once.
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

/**
 * The records to write on a name's new resolver: the caller's, or, with `allowIncompleteRecords`,
 * the common ones read from its current resolver (with a warning). Without either, a name whose
 * current resolver is a public resolver fails with `RECORDS_UNKNOWN`: copying nothing would leave
 * its profile behind on a resolver nobody can edit any more.
 */
export const recordsToCopy = Effect.fnUntraced(function* (
  client: Client,
  input: Exclude<NameInput, string> | undefined,
  name: string,
  options: { readonly hasRecords: boolean; readonly allowIncomplete: boolean },
): Effect.fn.Return<
  { readonly records: CopiedRecords | undefined; readonly warning?: Plan.Warning },
  AnyError
> {
  if (input?.records !== undefined) return { records: input.records };
  if (!options.hasRecords) return { records: undefined };
  if (!options.allowIncomplete) {
    return yield* Effect.fail(
      new MigrationError({
        code: "RECORDS_UNKNOWN",
        shortMessage: `The records of ${name} are not known, so they cannot be copied.`,
        hint: 'Pass the name\'s records, keep its resolver (`resolver: "keep"`), or pass `allowIncompleteRecords` to copy the common ones.',
      }),
    );
  }
  return {
    records: yield* commonRecords(client, name),
    warning: {
      code: "RECORDS_MAY_BE_INCOMPLETE",
      message: `Only the common records of ${name} are copied; others stay on its ENSv1 resolver.`,
    },
  };
});
