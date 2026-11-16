import type { Abi, AbiContentType } from "../../../schemas/records.js";
import type { CallExecutionResult, WriteError } from "../../../write/types.js";

export type SetAbiParameters =
  | {
      readonly name: string;
      readonly contentType: Exclude<AbiContentType, "uri">;
      readonly value: Abi;
    }
  | {
      readonly name: string;
      readonly contentType: "uri";
      readonly value: string;
    };

export type SetAbiResult = CallExecutionResult;

export type SetAbiError = WriteError;
