import { Arbitrary, Schema } from "effect";

import { getAddress, keccak256, toHex, type Address, type Hex } from "viem";

// Splits by code point, so multi-unit characters such as emoji stay whole.
const chars = (alphabet: string) => Schema.Literals([...alphabet] as [string, ...string[]]);

/** Lowercase ASCII labels that are already normalized (a–z, 0–9, inner hyphens). */
export const asciiLabel = Arbitrary.map(
  Arbitrary.schema(
    Schema.Array(chars("abcdefghijklmnopqrstuvwxyz0123456789")).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(24),
    ),
  ),
  (letters) => letters.join(""),
);

// One alphabet per label: ENSIP-15 rejects labels mixing scripts (e.g. Han with Latin `ß`).
// Units are whole graphemes, so emoji sequences (skin tones, ZWJ) are never split.
const scripts = {
  latin: [..."abcxyz019éßü"],
  han: [..."名字中文"],
  emoji: ["🔥", "🦊", "👍🏻", "👨‍👩‍👧"],
} as const;

/** Single-script labels (accented Latin, Han or emoji) that normalize to themselves. */
export const unicodeLabel = Arbitrary.flatMap(
  Arbitrary.schema(Schema.Literals(["latin", "han", "emoji"])),
  (script) =>
    Arbitrary.map(
      Arbitrary.array(Arbitrary.schema(Schema.Literals(scripts[script])), {
        minLength: 1,
        maxLength: 8,
      }),
      (parts) => parts.join(""),
    ),
);

/** Normalized names with 1–4 labels. */
export const name = Arbitrary.map(
  Arbitrary.schema(
    Schema.Array(Schema.Number.check(Schema.isInt())).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(4),
    ),
  ),
  (seeds) => seeds.map((value, index) => `l${Math.abs(value) % 997}x${index}`).join("."),
);

/** `.eth` names built from ASCII labels. */
export const ethName = Arbitrary.map(asciiLabel, (label) => `${label}.eth`);

/** Checksummed addresses derived from arbitrary integers. */
export const address = Arbitrary.map(
  Arbitrary.schema(Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
  (value): Address => getAddress(keccak256(toHex(value)).slice(0, 42)),
);

/** 32-byte hex values. */
export const bytes32 = Arbitrary.map(
  Arbitrary.schema(Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
  (value): Hex => keccak256(toHex(value)),
);

/** Non-negative integers below `max`. */
export const uint = (max: number) =>
  Arbitrary.schema(
    Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: max })),
  );
