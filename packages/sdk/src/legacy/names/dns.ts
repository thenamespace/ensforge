import { Effect, Schema } from "effect";

import { bytesToHex, bytesToString, hexToBytes, stringToBytes } from "viem";
import { packetToBytes } from "viem/ens";

import { CodecError } from "../errors/codec-error.js";
import { defineSyncFunction } from "../internal/sync-function.js";
import { DnsEncodedName, type DnsEncodedName as DnsEncodedNameValue } from "../schemas/dns.js";
import type { NormalizedName as NormalizedNameValue } from "../schemas/name.js";
import { normalizeName } from "./normalize.js";

export const dnsEncodeName = defineSyncFunction(
  Effect.fn("dnsEncodeName")(function* (name: string | NormalizedNameValue) {
    const normalizedName = yield* normalizeName.effect(name).pipe(
      Effect.mapError(
        () =>
          new CodecError({
            code: "INVALID_DNS_NAME",
            message: `Unable to DNS-encode ENS name: ${name}`,
          }),
      ),
    );

    return yield* Effect.try({
      try: () => Schema.decodeSync(DnsEncodedName)(bytesToHex(packetToBytes(normalizedName))),
      catch: () =>
        new CodecError({
          code: "INVALID_DNS_NAME",
          message: `Unable to DNS-encode ENS name: ${name}`,
        }),
    });
  }),
);

export const dnsDecodeName = (
  encodedName: `0x${string}` | DnsEncodedNameValue,
): NormalizedNameValue => {
  let bytes: Uint8Array;

  try {
    const encoded = Schema.decodeSync(DnsEncodedName)(encodedName);

    bytes = hexToBytes(encoded);
  } catch {
    throw new CodecError({
      code: "MALFORMED_DNS_PACKET",
      message: "Unable to decode malformed DNS name bytes",
    });
  }

  const labels: Array<string> = [];
  let offset = 0;

  try {
    while (bytes[offset] !== 0) {
      const length = bytes[offset];

      if (length === undefined) throw new Error("Missing DNS label length");

      const start = offset + 1;
      const end = start + length;
      const labelBytes = bytes.subarray(start, end);
      const label = bytesToString(labelBytes);

      if (bytesToHex(stringToBytes(label)) !== bytesToHex(labelBytes)) {
        throw new Error("Invalid UTF-8 label");
      }

      labels.push(label);
      offset = end;
    }

    const name = labels.join(".");
    const normalizedName = normalizeName(name);

    if (normalizedName !== name) {
      throw new CodecError({
        code: "INVALID_DNS_NAME",
        message: "DNS name bytes must contain an ENSIP-15 normalized name",
      });
    }

    return normalizedName;
  } catch (error) {
    if (error instanceof CodecError) throw error;

    throw new CodecError({
      code: "INVALID_DNS_NAME",
      message: "DNS name bytes do not contain a valid ENS name",
    });
  }
};
