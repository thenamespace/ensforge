"use client";

import type { EnsReadRequest, RpcError } from "@ensforge/sdk";
import type { ReadBatchError, ReadBatchResult, ReadBatchSettledResult } from "@ensforge/sdk/batch";

import {
  readBatchAtom,
  readBatchSettledAtom,
  type ReadBatchAtomParameters,
} from "../atoms/generic.js";
import type { UseEnsAtomParameters } from "../query/options.js";
import type { EnsAtomResult } from "../query/result.js";
import { useQueryAtom } from "./use-query.js";

type ReadRequests = Readonly<Record<string, EnsReadRequest<unknown, unknown>>>;

export const useReadBatch = <
  const Requests extends ReadRequests,
  Selected = ReadBatchResult<Requests>,
>(
  input: UseEnsAtomParameters<
    ReadBatchAtomParameters<Requests>,
    ReadBatchResult<Requests>,
    ReadBatchError<Requests>,
    Selected
  >,
): EnsAtomResult<Selected, ReadBatchError<Requests>> => useQueryAtom(readBatchAtom, input);

export const useReadBatchSettled = <
  const Requests extends ReadRequests,
  Selected = ReadBatchSettledResult<Requests>,
>(
  input: UseEnsAtomParameters<
    ReadBatchAtomParameters<Requests>,
    ReadBatchSettledResult<Requests>,
    RpcError,
    Selected
  >,
): EnsAtomResult<Selected, RpcError> => useQueryAtom(readBatchSettledAtom, input);
