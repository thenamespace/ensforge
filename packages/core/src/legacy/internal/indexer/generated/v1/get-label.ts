/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never };
import type { TypedDocumentString } from "../../document.js";
export type V1GetLabelQueryVariables = Exact<{
  labelhash: string;
}>;

export type V1GetLabelQuery = {
  readonly _meta: { readonly block: { readonly number: number } } | null;
  readonly domains: ReadonlyArray<{
    readonly labelName: string | null;
    readonly labelhash: `0x${string}` | null;
  }>;
};

export const V1GetLabelDocument =
  "query V1GetLabel($labelhash: Bytes!) {\n  _meta {\n    block {\n      number\n    }\n  }\n  domains(first: 1, where: {labelhash: $labelhash, labelName_not: null}) {\n    labelName\n    labelhash\n  }\n}" as TypedDocumentString<
    V1GetLabelQuery,
    V1GetLabelQueryVariables
  >;
