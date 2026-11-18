import { bytesToHex, bytesToString, hexToBytes, type Hex } from "viem";

/** DNS record types ensforge reads. */
export const RecordType = { txt: 16 } as const;

/** One resource record in DNS wire format. */
type ResourceRecord = {
  readonly name: string;
  readonly type: number;
  readonly data: Uint8Array;
};

/** The RRSIG fields of a signed RRSet that ensforge needs, and its records. */
export type SignedSet = {
  readonly typeCovered: number;
  readonly expiration: number;
  readonly inception: number;
  readonly records: readonly ResourceRecord[];
};

const malformed = () => new Error("Malformed DNS wire data.");

const uint16 = (bytes: Uint8Array, offset: number): number => {
  if (offset + 2 > bytes.length) throw malformed();
  return ((bytes[offset] as number) << 8) | (bytes[offset + 1] as number);
};

const uint32 = (bytes: Uint8Array, offset: number): number =>
  uint16(bytes, offset) * 0x10000 + uint16(bytes, offset + 2);

/** Reads an uncompressed name (RRSets are canonical, so never compressed) and its end offset. */
const readName = (bytes: Uint8Array, start: number): readonly [string, number] => {
  const labels: string[] = [];
  let offset = start;
  for (;;) {
    const length = bytes[offset];
    if (length === undefined || length > 63) throw malformed();
    offset += 1;
    if (length === 0) return [labels.join("."), offset];
    if (offset + length > bytes.length) throw malformed();
    labels.push(bytesToString(bytes.subarray(offset, offset + length)).toLowerCase());
    offset += length;
  }
};

/**
 * Parses the `rrset` of a signed RRSet: the RRSIG header without its signature, then the
 * records it signs. Throws on malformed data.
 */
export const parseSignedSet = (rrset: Hex): SignedSet => {
  const bytes = hexToBytes(rrset);
  const typeCovered = uint16(bytes, 0);
  const expiration = uint32(bytes, 8);
  const inception = uint32(bytes, 12);
  let [, offset] = readName(bytes, 18);

  const records: ResourceRecord[] = [];
  while (offset < bytes.length) {
    const [name, end] = readName(bytes, offset);
    const type = uint16(bytes, end);
    const length = uint16(bytes, end + 8);
    const dataStart = end + 10;
    if (dataStart + length > bytes.length) throw malformed();
    records.push({ name, type, data: bytes.subarray(dataStart, dataStart + length) });
    offset = dataStart + length;
  }

  return { typeCovered, expiration, inception, records };
};

/**
 * `records`, resource records in DNS wire format (as `setDNSRecords` takes them), with their owner
 * names in lowercase, the canonical form `dns.getRecords` reads: resolvers key records by the
 * exact bytes of the owner name, while DNS names are case-insensitive. Only ASCII letters of the
 * owner names change; record data is untouched. Throws on malformed data.
 */
export const lowercaseOwnerNames = (records: Hex): Hex => {
  const bytes = hexToBytes(records);
  let offset = 0;
  while (offset < bytes.length) {
    for (;;) {
      const length = bytes[offset];
      if (length === undefined || length > 63) throw malformed();
      offset += 1;
      if (length === 0) break;
      if (offset + length > bytes.length) throw malformed();
      for (let index = offset; index < offset + length; index += 1) {
        const byte = bytes[index] as number;
        if (byte >= 0x41 && byte <= 0x5a) bytes[index] = byte + 0x20;
      }
      offset += length;
    }
    // TYPE, CLASS and TTL, then RDLENGTH and the record data.
    offset += 10 + uint16(bytes, offset + 8);
    if (offset > bytes.length) throw malformed();
  }
  return bytesToHex(bytes);
};

/** The character-strings of a TXT record's data. */
export const txtStrings = (data: Uint8Array): string[] => {
  const strings: string[] = [];
  let offset = 0;
  while (offset < data.length) {
    const length = data[offset] as number;
    if (offset + 1 + length > data.length) throw malformed();
    strings.push(bytesToString(data.subarray(offset + 1, offset + 1 + length)));
    offset += 1 + length;
  }
  return strings;
};
