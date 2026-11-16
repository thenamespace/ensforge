import type { BlockParameters } from "../../../action/block.js";
import type { ResolveError, ResolveResult } from "../resolve/types.js";

export type ResolveBatchCall =
  | {
      readonly name: string;
      readonly data: string;
      readonly resolverAddress?: never;
      readonly gateways?: never;
    }
  | {
      readonly name: string;
      readonly data: string;
      readonly resolverAddress: string;
      readonly gateways?: ReadonlyArray<string>;
    };

export type ResolveBatchParameters = {
  readonly calls: ReadonlyArray<ResolveBatchCall>;
} & BlockParameters;

export type ResolveBatchResult = ReadonlyArray<ResolveResult>;

export type ResolveBatchError = ResolveError;
