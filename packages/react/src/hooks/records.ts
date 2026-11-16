"use client";

import {
  getAbiAtom,
  getAddressAtom,
  getAddressesAtom,
  getAvatarAtom,
  getContentHashAtom,
  getDataAtom,
  getInterfaceAtom,
  getNameAtom,
  getPubkeyAtom,
  getTextAtom,
  getTextsAtom,
  createClearAvatarMutationAtom,
  createClearRecordsMutationAtom,
  createSetAbiMutationAtom,
  createSetAddressMutationAtom,
  createSetAddressesMutationAtom,
  createSetAvatarMutationAtom,
  createSetContentHashMutationAtom,
  createSetDataMutationAtom,
  createSetInterfaceMutationAtom,
  createSetNameMutationAtom,
  createSetPubkeyMutationAtom,
  createSetRecordsMutationAtom,
  createSetTextMutationAtom,
  createSetTextsMutationAtom,
} from "../atoms/records.js";
import { makeMutationHook } from "./use-mutation.js";
import { makeQueryHook } from "./use-query.js";
import { makeSuspenseQueryHook } from "./use-suspense-query.js";

export const useAbi = makeQueryHook(getAbiAtom);

export const useAbiSuspense = makeSuspenseQueryHook(getAbiAtom);

export const useAddress = makeQueryHook(getAddressAtom);

export const useAddressSuspense = makeSuspenseQueryHook(getAddressAtom);

export const useAddresses = makeQueryHook(getAddressesAtom);

export const useAddressesSuspense = makeSuspenseQueryHook(getAddressesAtom);

export const useAvatar = makeQueryHook(getAvatarAtom);

export const useAvatarSuspense = makeSuspenseQueryHook(getAvatarAtom);

export const useContentHash = makeQueryHook(getContentHashAtom);

export const useContentHashSuspense = makeSuspenseQueryHook(getContentHashAtom);

export const useData = makeQueryHook(getDataAtom);

export const useDataSuspense = makeSuspenseQueryHook(getDataAtom);

export const useInterface = makeQueryHook(getInterfaceAtom);

export const useInterfaceSuspense = makeSuspenseQueryHook(getInterfaceAtom);

export const useNameRecord = makeQueryHook(getNameAtom);

export const useNameRecordSuspense = makeSuspenseQueryHook(getNameAtom);

export const usePubkey = makeQueryHook(getPubkeyAtom);

export const usePubkeySuspense = makeSuspenseQueryHook(getPubkeyAtom);

export const useText = makeQueryHook(getTextAtom);

export const useTextSuspense = makeSuspenseQueryHook(getTextAtom);

export const useTexts = makeQueryHook(getTextsAtom);

export const useTextsSuspense = makeSuspenseQueryHook(getTextsAtom);

export const useClearAvatar = makeMutationHook(createClearAvatarMutationAtom);

export const useClearRecords = makeMutationHook(createClearRecordsMutationAtom);

export const useSetAbi = makeMutationHook(createSetAbiMutationAtom);

export const useSetAddress = makeMutationHook(createSetAddressMutationAtom);

export const useSetAddresses = makeMutationHook(createSetAddressesMutationAtom);

export const useSetAvatar = makeMutationHook(createSetAvatarMutationAtom);

export const useSetContentHash = makeMutationHook(createSetContentHashMutationAtom);

export const useSetData = makeMutationHook(createSetDataMutationAtom);

export const useSetInterface = makeMutationHook(createSetInterfaceMutationAtom);

export const useSetName = makeMutationHook(createSetNameMutationAtom);

export const useSetPubkey = makeMutationHook(createSetPubkeyMutationAtom);

export const useSetRecords = makeMutationHook(createSetRecordsMutationAtom);

export const useSetText = makeMutationHook(createSetTextMutationAtom);

export const useSetTexts = makeMutationHook(createSetTextsMutationAtom);
