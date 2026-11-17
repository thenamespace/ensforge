import { Predicate } from "effect";

type Parameter = { readonly type: string; readonly components?: readonly Parameter[] };
type AbiItem = {
  readonly type: string;
  readonly name?: string;
  readonly inputs?: readonly Parameter[];
  readonly outputs?: readonly Parameter[];
  readonly stateMutability?: string;
};

/** Whether a runtime value is an ABI, which the report prints one signature per line. */
export const isAbi = (value: unknown): value is readonly AbiItem[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (item) => Predicate.isObjectOrArray(item) && Predicate.isString((item as AbiItem).type),
  );

const parameterType = (parameter: Parameter): string =>
  parameter.type.startsWith("tuple")
    ? `(${(parameter.components ?? []).map(parameterType).join(",")})${parameter.type.slice("tuple".length)}`
    : parameter.type;

/** One ABI item as `kind name(inputs) mutability returns (outputs)`. */
export const formatAbiItem = (item: AbiItem): string => {
  const inputs = (item.inputs ?? []).map(parameterType).join(",");
  const mutability =
    item.stateMutability === undefined || item.stateMutability === "nonpayable"
      ? ""
      : ` ${item.stateMutability}`;
  const outputs =
    item.outputs === undefined || item.outputs.length === 0
      ? ""
      : ` returns (${item.outputs.map(parameterType).join(",")})`;
  return `${item.type}${item.name === undefined ? "" : ` ${item.name}`}(${inputs})${mutability}${outputs}`;
};
