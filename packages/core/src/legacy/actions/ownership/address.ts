import { Effect, Schema } from "effect";

import { isAddressEqual, zeroAddress } from "viem";

import { CodecError } from "../../errors/codec-error.js";
import { EthereumAddress } from "../../schemas/identity.js";

export const decodeOwnershipAddress = (value: string, label: string) =>
  Effect.try({
    try: () => Schema.decodeUnknownSync(EthereumAddress)(value),
    catch: () =>
      new CodecError({
        code: "INVALID_ADDRESS",
        message: `Invalid ${label} address`,
      }),
  });

export const decodeTransferRecipient = Effect.fn("ensforge.decodeTransferRecipient")(function* (
  value: string,
) {
  const address = yield* decodeOwnershipAddress(value, "recipient");

  if (isAddressEqual(address, zeroAddress)) {
    return yield* new CodecError({
      code: "INVALID_ADDRESS",
      message: "Transfer recipient cannot be the zero address",
    });
  }

  return address;
});
