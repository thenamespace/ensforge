import { Effect, Array as Arr, Record as Rec, String as Str } from "effect";

import { Abis } from "@ensforge/contracts";
import { isHex, type Address, type Hex } from "viem";

import type { NameInput } from "../../actions/migration/types.js";
import type { Client } from "../../client/types.js";
import { MigrationError } from "../../errors/classes/MigrationError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import * as CoinType from "../../utils/CoinType.js";
import { namehash } from "../../utils/Name.js";
import { callIndexer } from "../indexer/call.js";
import { readRecords } from "../records/read.js";
import type { RecordWrites } from "../records/write-profiles.js";
import * as Rpc from "../rpc/index.js";

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
  ...Arr.map([10, 137, 324, 8453, 42161, 59144, 534352], CoinType.fromChainId),
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
    readonly abi?: boolean | undefined;
    readonly interfaces?: readonly Hex[] | undefined;
    readonly data?: readonly string[] | undefined;
    readonly nameRecord?: boolean | undefined;
  },
): Effect.fn.Return<CopiedRecords, AnyError> {
  const read = yield* readRecords(client, {
    name,
    selection: {
      texts: selection.texts,
      addresses: selection.addresses,
      ...(selection.contentHash ? { contentHash: true } : {}),
      ...(selection.abi === true ? { abi: true } : {}),
      ...(selection.nameRecord === true ? { nameRecord: true } : {}),
      ...(selection.interfaces === undefined ? {} : { interfaces: selection.interfaces }),
      ...(selection.data === undefined ? {} : { data: selection.data }),
    },
  });
  // The encoded content hash, copied as is: a codec ensforge cannot decode is still kept. A
  // resolver that only answers through `resolve` (off-chain, wildcard) gives the decoded URI.
  const contentHashBytes =
    selection.contentHash && read.resolver !== null && read.contentHash !== null
      ? yield* Rpc.readContractOrUndefined(client, {
          address: read.resolver,
          abi: Abis.v1.publicResolver,
          functionName: "contenthash",
          args: [namehash(name)],
        })
      : undefined;
  const interfaces = Rec.fromEntries(
    Arr.filter(
      Rec.toEntries(read.interfaces ?? {}),
      (entry): entry is [Hex, Address] => entry[1] !== null,
    ),
  );
  const data = Rec.fromEntries(
    Arr.filter(
      Rec.toEntries(read.data ?? {}),
      (entry): entry is [string, Hex] => entry[1] !== null,
    ),
  );

  const texts = Rec.fromEntries(
    Arr.filter(
      Rec.toEntries(read.texts ?? {}),
      (entry): entry is [string, string] => entry[1] !== null,
    ),
  );
  const fallback = read.addresses?.[String(defaultEvm)] ?? null;
  const addresses = Rec.fromEntries(
    Arr.filter(
      Rec.toEntries(read.addresses ?? {}),
      (entry): entry is [string, string] =>
        entry[1] !== null &&
        (entry[0] === String(defaultEvm) ||
          entry[0] === "60" ||
          !CoinType.isEvm(BigInt(entry[0])) ||
          entry[1] !== fallback),
    ),
  );

  return {
    ...(Rec.keys(texts).length > 0 ? { texts } : {}),
    ...(Rec.keys(addresses).length > 0 ? { addresses } : {}),
    ...(contentHashBytes !== undefined && contentHashBytes !== "0x"
      ? { contentHashBytes }
      : read.contentHash === null || read.contentHash === undefined
        ? {}
        : { contentHash: read.contentHash.uri }),
    ...(read.abi === null || read.abi === undefined
      ? {}
      : { abi: { contentType: read.abi.contentType, value: read.abi.data } }),
    ...(Rec.keys(interfaces).length > 0 ? { interfaces } : {}),
    ...(Rec.keys(data).length > 0 ? { data } : {}),
    ...(read.nameRecord === null || read.nameRecord === undefined || read.nameRecord === ""
      ? {}
      : { nameRecord: read.nameRecord }),
  };
});

/** Record keys the indexer has seen for a name, split into what migration can copy. */
export type RecordInventory = {
  readonly texts: readonly string[];
  readonly addresses: readonly bigint[];
  readonly contentHash: boolean;
  readonly abi: boolean;
  readonly interfaces: readonly Hex[];
  readonly data: readonly string[];
  readonly nameRecord: boolean;
  /** Keys that cannot be copied: public keys (no ENSv2 resolver stores them), unknown keys. */
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
  const interfaces: Hex[] = [];
  const data: string[] = [];
  const skipped: string[] = [];
  let contentHash = false;
  let abi = false;
  let nameRecord = false;
  for (const key of result.inventory.keys) {
    const interfaceId = Str.slice(10)(key);
    if (Str.startsWith("text:")(key)) texts.push(Str.slice(5)(key));
    else if (Str.startsWith("addr:")(key) && /^\d+$/.test(Str.slice(5)(key)))
      addresses.push(BigInt(Str.slice(5)(key)));
    else if (key === "contenthash") contentHash = true;
    else if (key === "abi" || Str.startsWith("abi:")(key)) abi = true;
    else if (Str.startsWith("interface:")(key) && isHex(interfaceId)) interfaces.push(interfaceId);
    else if (Str.startsWith("data:")(key)) data.push(Str.slice(5)(key));
    else if (key === "name") nameRecord = true;
    else skipped.push(key);
  }
  return {
    texts,
    addresses,
    contentHash,
    abi,
    interfaces,
    data,
    nameRecord,
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
    // Records left behind stay on a resolver nobody edits any more: refuse unless asked to.
    const missing = [
      ...(inventory.skipped.length > 0
        ? [`its ${Arr.join(inventory.skipped, ", ")} records cannot be copied`]
        : []),
      ...(inventory.complete ? [] : ["the indexer could not list every record"]),
    ];
    if (missing.length > 0 && !options.allowIncomplete) {
      return yield* Effect.fail(
        new MigrationError({
          code: "RECORDS_UNKNOWN",
          shortMessage: `Not every record of ${name} can be copied: ${Arr.join(missing, "; ")}.`,
          hint: 'Pass the name\'s records, keep its resolver (`resolver: "keep"`), or pass `allowIncompleteRecords` to copy the others.',
        }),
      );
    }
    const warnings: Plan.Warning[] = [];
    if (inventory.skipped.length > 0) {
      warnings.push({
        code: "RECORDS_NOT_COPIED",
        message: `${name}'s ${Arr.join(inventory.skipped, ", ")} records are not copied; they stay on its ENSv1 resolver.`,
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
