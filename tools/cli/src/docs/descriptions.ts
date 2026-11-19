/* oxlint-disable effecttsgo/prefer-effect-string -- synchronous text trimming, where native string methods read more directly */
import { Array as Arr, String as Str } from "effect";

import { descriptionRange } from "./lint.ts";

const sentence = (text: string): string => {
  const flat = Str.trim(Str.replaceAll(/\s+/g, " ")(text));
  return /[.!?]$/.test(flat) ? flat : `${flat}.`;
};

/** Cuts a too-long sentence at the last word that fits, ending it with a full stop. */
const clip = (text: string): string => {
  if (text.length <= descriptionRange.max) return text;
  const head = Str.slice(0, descriptionRange.max - 1)(text);
  const cut = head.lastIndexOf(" ");
  return `${Str.slice(0, cut)(head).replace(/[\s,;:(-]+$/, "")}.`;
};

/**
 * A page description inside the 120-160 character range: the `lead` sentence (clipped when too
 * long), then each `filler` in order that still fits, until it is long enough. Give fillers from
 * most to least informative; ones that would overflow are skipped.
 */
export const describe = (lead: string, ...fillers: readonly string[]): string => {
  let text = clip(sentence(lead));
  for (const filler of fillers) {
    if (text.length >= descriptionRange.min) break;
    const next = `${text} ${filler}`;
    if (next.length <= descriptionRange.max) text = next;
  }
  return text;
};

/** Related ENS terms a reader might search for, by action domain or topic. */
const ensTerms: Readonly<Record<string, readonly string[]>> = {
  approval: ["approval", "operator", "delegate", "ERC-721", "setApprovalForAll"],
  dns: ["DNS", "DNSSEC", "DNS name", "TLD", "offchain resolver"],
  event: ["events", "logs", "NameWrapper", "registry events"],
  indexer: ["indexer", "bigname", "subgraph", "history", "search"],
  migration: ["ENSv2", "migrate", "upgrade", "ENSv1"],
  name: ["ENS name", "owner", "manager", "ttl", "labelhash", "namehash"],
  permission: ["permission", "roles", "records access", "ENSv2"],
  plan: ["plan", "multi-step", "resume", "reconcile"],
  primaryName: ["primary name", "reverse record", "reverse resolution", "ENSIP-19"],
  record: ["resolver", "text record", "address record", "avatar", "content hash", "ENSIP-9"],
  registration: ["register", "renew", "commit-reveal", "price", ".eth", "ETH registrar"],
  registry: ["registry", "ENSv2", "subregistry"],
  resolver: ["resolver", "CCIP-Read", "public resolver", "ENSIP-10"],
  role: ["role", "ENSv2", "grant", "revoke"],
  subname: ["subname", "subdomain", "ENS name"],
  wrapper: ["NameWrapper", "fuses", "wrap", "unwrap", "ERC-1155"],
  batch: ["batch", "multicall", "request"],
};

/** Keywords for a page: the given specific names, then ENS terms of `topic`, without repeats. */
export const keywordsFor = (names: readonly string[], topic?: string): readonly string[] =>
  Arr.dedupe([...names, ...(topic === undefined ? [] : (ensTerms[topic] ?? []))]);
