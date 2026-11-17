import { Schema } from "effect";

import { decode, encode, getCodec } from "@ensdomains/content-hash";

import { CodecError } from "../errors/codec-error.js";
import {
  ContentHash,
  ContentHashProtocol,
  type ContentHash as ContentHashValue,
  type ContentHashProtocol as ContentHashProtocolValue,
} from "../schemas/records.js";

export interface EncodeContentHashParameters {
  readonly protocol: ContentHashProtocolValue;
  readonly value: string;
}

export interface DecodedContentHash {
  readonly protocol: ContentHashProtocolValue;
  readonly value: string;
}

export const encodeContentHash = ({
  protocol,
  value,
}: EncodeContentHashParameters): ContentHashValue => {
  if (!Schema.is(ContentHashProtocol)(protocol)) {
    throw new CodecError({
      code: "UNSUPPORTED_CONTENT_PROTOCOL",
      message: `Unsupported content hash protocol: ${protocol}`,
    });
  }

  try {
    return Schema.decodeSync(ContentHash)(`0x${encode(protocol, value)}`);
  } catch {
    throw new CodecError({
      code: "INVALID_CONTENT_HASH",
      message: `Invalid ${protocol} content hash value`,
    });
  }
};

export const decodeContentHash = (
  contentHash: `0x${string}` | ContentHashValue,
): DecodedContentHash | null => {
  let encoded: ContentHashValue;

  try {
    encoded = Schema.decodeSync(ContentHash)(contentHash);
  } catch {
    throw new CodecError({
      code: "INVALID_CONTENT_HASH",
      message: "Invalid encoded content hash",
    });
  }

  if (encoded.length === 2) return null;

  const unprefixed = encoded.slice(2);

  try {
    const protocol = getCodec(unprefixed);

    if (protocol === undefined || !Schema.is(ContentHashProtocol)(protocol)) {
      throw new CodecError({
        code: "UNSUPPORTED_CONTENT_PROTOCOL",
        message: "Unsupported encoded content hash protocol",
      });
    }

    return Object.freeze({ protocol, value: decode(unprefixed) });
  } catch (error) {
    if (error instanceof CodecError) throw error;

    throw new CodecError({
      code: "INVALID_CONTENT_HASH",
      message: "Invalid encoded content hash",
    });
  }
};
