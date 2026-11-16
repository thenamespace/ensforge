"use client";

import {
  getResolverAtom,
  getResolverVersionAtom,
  predictResolverAddressAtom,
  resolveAtom,
  resolveBatchAtom,
  resolveWithResolverAtom,
  createCreateResolverMutationAtom,
  createGetOrCreateResolverMutationAtom,
  createSetResolverMutationAtom,
  createSetResolverAndRecordsMutationAtom,
  createUpgradeResolverMutationAtom,
} from "../atoms/resolution.js";
import { makeMutationHook } from "./use-mutation.js";
import { makeQueryHook } from "./use-query.js";
import { makeSuspenseQueryHook } from "./use-suspense-query.js";

export const useResolver = makeQueryHook(getResolverAtom);

export const useResolverSuspense = makeSuspenseQueryHook(getResolverAtom);

export const useResolverVersion = makeQueryHook(getResolverVersionAtom);

export const useResolverVersionSuspense = makeSuspenseQueryHook(getResolverVersionAtom);

export const usePredictResolverAddress = makeQueryHook(predictResolverAddressAtom);

export const usePredictResolverAddressSuspense = makeSuspenseQueryHook(predictResolverAddressAtom);

export const useResolve = makeQueryHook(resolveAtom);

export const useResolveSuspense = makeSuspenseQueryHook(resolveAtom);

export const useResolveBatch = makeQueryHook(resolveBatchAtom);

export const useResolveBatchSuspense = makeSuspenseQueryHook(resolveBatchAtom);

export const useResolveWithResolver = makeQueryHook(resolveWithResolverAtom);

export const useResolveWithResolverSuspense = makeSuspenseQueryHook(resolveWithResolverAtom);

export const useCreateResolver = makeMutationHook(createCreateResolverMutationAtom);

export const useGetOrCreateResolver = makeMutationHook(createGetOrCreateResolverMutationAtom);

export const useSetResolver = makeMutationHook(createSetResolverMutationAtom);

export const useSetResolverAndRecords = makeMutationHook(createSetResolverAndRecordsMutationAtom);

export const useUpgradeResolver = makeMutationHook(createUpgradeResolverMutationAtom);
