import { Schema } from "effect";

import { hexToBytes } from "viem";

import { Hex } from "./hex.js";

const isDnsWireName = Schema.makeFilter<`0x${string}`>((value) => {
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(value)) {
    return "Expected a non-empty byte-aligned hexadecimal DNS name";
  }

  const bytes = hexToBytes(value);
  let offset = 0;

  while (offset < bytes.length) {
    const length = bytes[offset];

    if (length === undefined) return "Expected a complete DNS label";

    offset += 1;

    if (length === 0) {
      return offset === bytes.length || "Expected no bytes after the DNS terminator";
    }

    if (offset + length > bytes.length) return "Expected a complete DNS label";

    offset += length;
  }

  return "Expected a zero-terminated DNS name";
});

export const DnsEncodedName = Hex.pipe(Schema.check(isDnsWireName), Schema.brand("DnsEncodedName"));

export type DnsEncodedName = typeof DnsEncodedName.Type;
