import { Schema } from "effect";

import type { GetIndexedNameError } from "../get-indexed-name/types.js";

export const GetDecodedNameParameters = Schema.Struct({
  name: Schema.String,
  allowIncomplete: Schema.optional(Schema.Boolean),
});
export type GetDecodedNameParameters = typeof GetDecodedNameParameters.Type;

export type GetDecodedNameResult = string | null;

export type GetDecodedNameError = GetIndexedNameError;
