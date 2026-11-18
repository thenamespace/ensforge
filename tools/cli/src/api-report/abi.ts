import { Array as Arr, Predicate, String as Str } from "effect";

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
  Arr.isArray(value) &&
  value.length > 0 &&
  Arr.every(value, (item) => Predicate.hasProperty(item, "type") && Predicate.isString(item.type));

const parameterType = (parameter: Parameter): string =>
  Str.startsWith("tuple")(parameter.type)
    ? `(${Arr.join(Arr.map(parameter.components ?? [], parameterType), ",")})${Str.slice("tuple".length)(parameter.type)}`
    : parameter.type;

/** One ABI item as `kind name(inputs) mutability returns (outputs)`. */
export const formatAbiItem = (item: AbiItem): string => {
  const inputs = Arr.join(Arr.map(item.inputs ?? [], parameterType), ",");
  const mutability =
    item.stateMutability === undefined || item.stateMutability === "nonpayable"
      ? ""
      : ` ${item.stateMutability}`;
  const outputs =
    item.outputs === undefined || item.outputs.length === 0
      ? ""
      : ` returns (${Arr.join(Arr.map(item.outputs, parameterType), ",")})`;
  return `${item.type}${item.name === undefined ? "" : ` ${item.name}`}(${inputs})${mutability}${outputs}`;
};
