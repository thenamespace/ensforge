import type { EnsReadRequest, RpcError } from "@ensforge/sdk";
import type { Ensforge } from "@ensforge/sdk";
import type {
  ReadBatchError,
  ReadBatchOptions,
  ReadBatchResult,
  ReadBatchSettledResult,
} from "@ensforge/sdk/batch";

import type { EnsAtomOptions } from "../query/options.js";
import { makeQueryAtom, type EnsAtom } from "./query.js";

type ReadRequests = Readonly<Record<string, EnsReadRequest<unknown, unknown>>>;

export interface ReadBatchAtomParameters<Requests extends ReadRequests> {
  readonly options?: ReadBatchOptions;
  readonly requests: Requests;
}

const readBatchAtomBase = makeQueryAtom<
  ReadBatchAtomParameters<ReadRequests>,
  ReadBatchResult<ReadRequests>,
  ReadBatchError<ReadRequests>
>("batch", (sdk) => ({
  effect: ({ options, requests }) => sdk.batch.readBatch.effect(requests, options),
}));

export const readBatchAtom = <const Requests extends ReadRequests>(
  sdk: Ensforge,
  parameters: ReadBatchAtomParameters<Requests>,
  options?: EnsAtomOptions<ReadBatchError<Requests>>,
): EnsAtom<ReadBatchResult<Requests>, ReadBatchError<Requests>> =>
  readBatchAtomBase(sdk, parameters, options as EnsAtomOptions<unknown>) as EnsAtom<
    ReadBatchResult<Requests>,
    ReadBatchError<Requests>
  >;

const readBatchSettledAtomBase = makeQueryAtom<
  ReadBatchAtomParameters<ReadRequests>,
  ReadBatchSettledResult<ReadRequests>,
  RpcError
>("batch", (sdk) => ({
  effect: ({ options, requests }) => sdk.batch.readBatchSettled.effect(requests, options),
}));

export const readBatchSettledAtom = <const Requests extends ReadRequests>(
  sdk: Ensforge,
  parameters: ReadBatchAtomParameters<Requests>,
  options?: EnsAtomOptions<RpcError>,
): EnsAtom<ReadBatchSettledResult<Requests>, RpcError> =>
  readBatchSettledAtomBase(sdk, parameters, options) as EnsAtom<
    ReadBatchSettledResult<Requests>,
    RpcError
  >;
