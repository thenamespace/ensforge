import { Effect, Schema } from "effect";

import { CodecError } from "../../errors/codec-error.js";
import { EthereumAddress } from "../../schemas/identity.js";

export const decodePermissionAddress = (value: string, label: string) =>
  Effect.try({
    try: () => Schema.decodeUnknownSync(EthereumAddress)(value),
    catch: () =>
      new CodecError({
        code: "INVALID_ADDRESS",
        message: `Invalid ${label} address`,
      }),
  });
