import { Schema } from "effect";

import { HcaError } from "@ensforge/core/legacy";
import {
  HcaRegistrationOperation,
  scopeHcaStorage,
  type HcaRegistrationStorage,
} from "@ensforge/core/legacy/hca";

import { createMemoryHcaStorage } from "../storage.js";

const registrationJson = Schema.fromJsonString(Schema.toCodecJson(HcaRegistrationOperation));

/** This serialization contains the commitment secret. Protect it until reveal. */
export const serializeHcaRegistration = (operation: HcaRegistrationOperation): string => {
  try {
    const validated = Schema.decodeUnknownSync(Schema.toType(HcaRegistrationOperation), {
      onExcessProperty: "error",
    })(operation);

    return Schema.encodeSync(registrationJson)(validated);
  } catch (cause) {
    throw new HcaError({
      code: "INVALID_PARAMETERS",
      message: "Cannot serialize HCA registration",
      cause,
    });
  }
};

export const restoreHcaRegistration = (serialized: string): HcaRegistrationOperation => {
  try {
    return Schema.decodeUnknownSync(registrationJson, { onExcessProperty: "error" })(serialized);
  } catch (cause) {
    throw new HcaError({
      code: "INVALID_PARAMETERS",
      message: "Invalid or unsupported saved HCA registration",
      cause,
    });
  }
};

/** Compatibility entry point backed by the common HCA store. Prefer createMemoryHcaStorage. */
export const createMemoryHcaRegistrationStorage = (): HcaRegistrationStorage => {
  const scoped = scopeHcaStorage(createMemoryHcaStorage(), "ens/registration", {
    encode: serializeHcaRegistration,
    decode: restoreHcaRegistration,
  });

  return {
    ...scoped,
    create: async (operation) => (operation.revision !== 0 ? false : scoped.create(operation)),
  };
};
