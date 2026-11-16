declare const resultType: unique symbol;

declare const variablesType: unique symbol;

export type TypedDocumentString<Result, Variables> = string & {
  readonly [resultType]?: Result;
  readonly [variablesType]?: Variables;
};
