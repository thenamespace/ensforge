import { Abis } from "@ensforge/contracts";
import {
  bytesToHex,
  concatBytes,
  encodeFunctionResult,
  hexToBytes,
  numberToBytes,
  stringToBytes,
  type Hex,
} from "viem";

// DNSSEC proofs the devnet's oracle accepts: ens-contracts' test trust anchor is a root DS for
// key tag 1278 with DummyAlgorithm (253) and DummyDigest (253), which check no signatures. The
// records still have to be well formed (RFC 4034 wire format, as `DNSSECImpl` reads it).

const algorithm = 253;
const anchorKeyTag = 1278;
export const RecordType = { txt: 16, rrsig: 46, dnskey: 48 } as const;

const u8 = (value: number) => numberToBytes(value, { size: 1 });
const u16 = (value: number) => numberToBytes(value, { size: 2 });
const u32 = (value: number) => numberToBytes(value, { size: 4 });

/** A name in DNS wire format, lower-cased as canonical RRSets are. */
const wireName = (name: string) =>
  concatBytes([
    ...name
      .split(".")
      .filter((label) => label !== "")
      .map((label) => {
        const bytes = stringToBytes(label.toLowerCase());
        return concatBytes([u8(bytes.length), bytes]);
      }),
    u8(0),
  ]);

const record = (name: string, recordType: number, rdata: Uint8Array, dnsClass = 1) =>
  concatBytes([
    wireName(name),
    u16(recordType),
    u16(dnsClass),
    u32(3600),
    u16(rdata.length),
    rdata,
  ]);

/**
 * One RRSet as `DNSSECImpl.verifyRRSet` takes it: the RRSIG's fields (without the signature),
 * then the records, signed by the root.
 */
const signedSet = (options: {
  readonly name: string;
  readonly covered: number;
  readonly records: readonly Uint8Array[];
  readonly inception: number;
  readonly expiration: number;
  readonly keyTag?: number;
  readonly labels?: number;
  readonly signer?: string;
}) => ({
  rrset: bytesToHex(
    concatBytes([
      u16(options.covered),
      u8(algorithm),
      u8(options.labels ?? options.name.split(".").filter((label) => label !== "").length),
      u32(3600),
      u32(options.expiration),
      u32(options.inception),
      u16(options.keyTag ?? anchorKeyTag),
      wireName(options.signer ?? "."),
      ...options.records,
    ]),
  ),
  sig: "0x" as Hex,
});

const dnskey = (flags: number, key: Hex) =>
  concatBytes([u16(flags), u8(3), u8(algorithm), hexToBytes(key)]);

/** The root's keys, signed by the test anchor's key (flags 0x0101: a secure entry point). */
const rootKeys = (window: { readonly inception: number; readonly expiration: number }) =>
  signedSet({
    name: ".",
    covered: RecordType.dnskey,
    records: [
      record(".", RecordType.dnskey, dnskey(0, "0x0000")),
      record(".", RecordType.dnskey, dnskey(0, "0x1112")),
      record(".", RecordType.dnskey, dnskey(0x0101, "0x0000")),
    ],
    ...window,
  });

/** Ways to break the proven record set, to raise each of the oracle's errors. */
export type Tampering = {
  readonly keyTag?: number;
  readonly labels?: number;
  readonly signer?: string;
  /** The type the signature claims to cover. */
  readonly covered?: number;
  /** The records' class (1 is IN). */
  readonly dnsClass?: number;
  /** Each record's owner name, by position, when it differs from the signed name. */
  readonly recordNames?: readonly string[];
  readonly expiration?: number;
};

/**
 * A DNSSEC proof that `owner` holds one TXT record per text in `texts`, signed at `inception`
 * (Unix seconds) and valid for 28 days, unless `tampered`. Texts over 255 bytes are split into
 * several character-strings, as DNS stores them.
 */
export const txtRecordsProof = (
  owner: string,
  texts: readonly string[],
  inception: number,
  tampered: Tampering = {},
) => {
  const window = { inception, expiration: inception + 28 * 86_400 };
  return [
    rootKeys(window),
    signedSet({
      name: owner,
      covered: tampered.covered ?? RecordType.txt,
      records: texts.map((text, index) => {
        const bytes = stringToBytes(text);
        const strings = Array.from({ length: Math.max(1, Math.ceil(bytes.length / 255)) }, (_, i) =>
          bytes.subarray(i * 255, (i + 1) * 255),
        );
        return record(
          tampered.recordNames?.[index] ?? owner,
          RecordType.txt,
          concatBytes(strings.flatMap((string) => [u8(string.length), string])),
          tampered.dnsClass,
        );
      }),
      ...window,
      ...(tampered.expiration === undefined ? {} : { expiration: tampered.expiration }),
      ...(tampered.keyTag === undefined ? {} : { keyTag: tampered.keyTag }),
      ...(tampered.labels === undefined ? {} : { labels: tampered.labels }),
      ...(tampered.signer === undefined ? {} : { signer: tampered.signer }),
    }),
  ];
};

/**
 * A DNSSEC proof that `_ens.<name>` holds the TXT strings `texts` (e.g. `a=0x…`), as
 * `DNSRegistrar` reads them.
 */
export const txtProof = (
  name: string,
  texts: readonly string[],
  inception: number,
  tampered: Tampering = {},
) => txtRecordsProof(`_ens.${name}`, texts, inception, tampered);

/** A DNSSEC proof as `IDNSGateway.resolve` returns it: record sets, root keys first. */
export type Proof = ReturnType<typeof txtProof>;

/** An ENSIP-17 DNSSEC gateway answer (`IDNSGateway.resolve`) for `proof`. */
export const gatewayAnswer = (proof: Proof) => ({
  status: 200,
  body: JSON.stringify({
    data: encodeFunctionResult({
      abi: Abis.shared.dnssecGateway,
      functionName: "resolve",
      result: proof,
    }),
  }),
});
