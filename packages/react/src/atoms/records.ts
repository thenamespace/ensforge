import { makeMutationAtom } from "./mutation.js";
import { makeQueryAtom } from "./query.js";

export const getAbiAtom = makeQueryAtom("records", (sdk) => sdk.records.getAbi);

export const getAddressAtom = makeQueryAtom("records", (sdk) => sdk.records.getAddress);

export const getAddressesAtom = makeQueryAtom("records", (sdk) => sdk.records.getAddresses);

export const getAvatarAtom = makeQueryAtom("records", (sdk) => sdk.records.getAvatar);

export const getContentHashAtom = makeQueryAtom("records", (sdk) => sdk.records.getContentHash);

export const getDataAtom = makeQueryAtom("records", (sdk) => sdk.records.getData);

export const getInterfaceAtom = makeQueryAtom("records", (sdk) => sdk.records.getInterface);

export const getNameAtom = makeQueryAtom("records", (sdk) => sdk.records.getName);

export const getPubkeyAtom = makeQueryAtom("records", (sdk) => sdk.records.getPubkey);

export const getTextAtom = makeQueryAtom("records", (sdk) => sdk.records.getText);

export const getTextsAtom = makeQueryAtom("records", (sdk) => sdk.records.getTexts);

export const createClearAvatarMutationAtom = makeMutationAtom(
  "records",
  (sdk) => sdk.records.clearAvatar,
);

export const createClearRecordsMutationAtom = makeMutationAtom(
  "records",
  (sdk) => sdk.records.clearRecords,
);

export const createSetAbiMutationAtom = makeMutationAtom("records", (sdk) => sdk.records.setAbi);

export const createSetAddressMutationAtom = makeMutationAtom(
  "records",
  (sdk) => sdk.records.setAddress,
);

export const createSetAddressesMutationAtom = makeMutationAtom(
  "records",
  (sdk) => sdk.records.setAddresses,
);

export const createSetAvatarMutationAtom = makeMutationAtom(
  "records",
  (sdk) => sdk.records.setAvatar,
);

export const createSetContentHashMutationAtom = makeMutationAtom(
  "records",
  (sdk) => sdk.records.setContentHash,
);

export const createSetDataMutationAtom = makeMutationAtom("records", (sdk) => sdk.records.setData);

export const createSetInterfaceMutationAtom = makeMutationAtom(
  "records",
  (sdk) => sdk.records.setInterface,
);

export const createSetNameMutationAtom = makeMutationAtom("records", (sdk) => sdk.records.setName);

export const createSetPubkeyMutationAtom = makeMutationAtom(
  "records",
  (sdk) => sdk.records.setPubkey,
);

export const createSetRecordsMutationAtom = makeMutationAtom(
  "records",
  (sdk) => sdk.records.setRecords,
);

export const createSetTextMutationAtom = makeMutationAtom("records", (sdk) => sdk.records.setText);

export const createSetTextsMutationAtom = makeMutationAtom(
  "records",
  (sdk) => sdk.records.setTexts,
);
