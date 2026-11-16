import { Schema } from "effect";

import { HcaError } from "@ensforge/core/legacy";
import { scopeHcaStorage, type HcaStorage } from "@ensforge/core/legacy/hca";

import { RhinestoneFundingRecord } from "./types.js";

const fundingJson = Schema.fromJsonString(Schema.toCodecJson(RhinestoneFundingRecord));

export const serializeRhinestoneFunding = (record: RhinestoneFundingRecord): string => {
  try {
    const validated = Schema.decodeUnknownSync(Schema.toType(RhinestoneFundingRecord), {
      onExcessProperty: "error",
    })(record);

    return Schema.encodeSync(fundingJson)(validated);
  } catch (cause) {
    throw new HcaError({ code: "INVALID_PARAMETERS", message: "Invalid funding record", cause });
  }
};

export const restoreRhinestoneFunding = (serialized: string): RhinestoneFundingRecord => {
  try {
    return Schema.decodeUnknownSync(fundingJson, { onExcessProperty: "error" })(serialized);
  } catch (cause) {
    throw new HcaError({
      code: "INVALID_PARAMETERS",
      message: "Invalid or unsupported funding record",
      cause,
    });
  }
};

export const fundingStorage = (storage: HcaStorage | undefined) => {
  if (!storage)
    throw new HcaError({
      code: "INVALID_PARAMETERS",
      message: "Configure workflow storage or pass funding storage explicitly",
    });
  return scopeHcaStorage(storage, "rhinestone/funding", {
    encode: serializeRhinestoneFunding,
    decode: restoreRhinestoneFunding,
  });
};
