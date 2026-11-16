import { Effect } from "effect";

import {
  baseRegistrarV1ApproveAbi,
  nameWrapperV1WrapAbi,
  nameWrapperV1WrapETH2LDAbi,
} from "@ensforge/contracts/internal";
import { encodeFunctionData } from "viem";

import { makeWriteIntent, type EnsWriteIntentPreparer } from "../../action/write-intent.js";
import { ContractError } from "../../errors/contract-error.js";
import type { EthereumAddress } from "../../schemas/identity.js";
import type { CallExecutionResult, WriteError } from "../../write/types.js";

interface EncodedWrapperIntent {
  readonly operation: string;
  readonly to: EthereumAddress;
  readonly data: `0x${string}`;
}

const prepare: EnsWriteIntentPreparer<EncodedWrapperIntent, WriteError> = Effect.fn(
  "ensforge.wrapper.prepareEncoded",
)((_config, parameters) =>
  Effect.succeed({ to: parameters.to, data: parameters.data, value: 0n, protocol: "v1" as const }),
);

const intent = (parameters: EncodedWrapperIntent) =>
  makeWriteIntent<EncodedWrapperIntent, CallExecutionResult, WriteError>(
    parameters.operation,
    parameters,
    prepare,
  );

const encode = (operation: string, makeData: () => `0x${string}`) =>
  Effect.try({
    try: makeData,
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: `Unable to encode ${operation}`,
        cause,
      }),
  });

export const approveWrapperIntent = Effect.fn("ensforge.approveWrapperIntent")(function* (
  registrar: EthereumAddress,
  wrapper: EthereumAddress,
  tokenId: bigint,
) {
  const data = yield* encode("Name Wrapper approval", () =>
    encodeFunctionData({
      abi: baseRegistrarV1ApproveAbi,
      functionName: "approve",
      args: [wrapper, tokenId],
    }),
  );

  return intent({ operation: "approveNameWrapper", to: registrar, data });
});

export const wrapIntent = Effect.fn("ensforge.wrapIntent")(function* (parameters: {
  readonly wrapper: EthereumAddress;
  readonly name: `0x${string}`;
  readonly owner: EthereumAddress;
  readonly resolver: EthereumAddress;
}) {
  const data = yield* encode("Name Wrapper wrap", () =>
    encodeFunctionData({
      abi: nameWrapperV1WrapAbi,
      functionName: "wrap",
      args: [parameters.name, parameters.owner, parameters.resolver],
    }),
  );

  return intent({ operation: "wrapName", to: parameters.wrapper, data });
});

export const wrapEth2ldIntent = Effect.fn("ensforge.wrapEth2ldIntent")(function* (parameters: {
  readonly wrapper: EthereumAddress;
  readonly label: string;
  readonly owner: EthereumAddress;
  readonly resolver: EthereumAddress;
  readonly fuses: number;
}) {
  const data = yield* encode("Name Wrapper .eth wrapping", () =>
    encodeFunctionData({
      abi: nameWrapperV1WrapETH2LDAbi,
      functionName: "wrapETH2LD",
      args: [parameters.label, parameters.owner, parameters.fuses, parameters.resolver],
    }),
  );

  return intent({ operation: "wrapName", to: parameters.wrapper, data });
});
