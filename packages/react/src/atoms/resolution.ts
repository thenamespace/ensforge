import { makeMutationAtom } from "./mutation.js";
import { makeQueryAtom } from "./query.js";

export const getResolverAtom = makeQueryAtom("resolution", (sdk) => sdk.resolution.getResolver);

export const getResolverVersionAtom = makeQueryAtom(
  "resolution",
  (sdk) => sdk.resolution.getResolverVersion,
);

export const predictResolverAddressAtom = makeQueryAtom(
  "resolution",
  (sdk) => sdk.resolution.predictResolverAddress,
);

export const resolveAtom = makeQueryAtom("resolution", (sdk) => sdk.resolution.resolve);

export const resolveBatchAtom = makeQueryAtom("resolution", (sdk) => sdk.resolution.resolveBatch);

export const resolveWithResolverAtom = makeQueryAtom(
  "resolution",
  (sdk) => sdk.resolution.resolveWithResolver,
);

export const createCreateResolverMutationAtom = makeMutationAtom(
  "resolution",
  (sdk) => sdk.resolution.createResolver,
);

export const createGetOrCreateResolverMutationAtom = makeMutationAtom(
  "resolution",
  (sdk) => sdk.resolution.getOrCreateResolver,
);

export const createSetResolverMutationAtom = makeMutationAtom(
  "resolution",
  (sdk) => sdk.resolution.setResolver,
);

export const createSetResolverAndRecordsMutationAtom = makeMutationAtom(
  "resolution",
  (sdk) => sdk.resolution.setResolverAndRecords,
);

export const createUpgradeResolverMutationAtom = makeMutationAtom(
  "resolution",
  (sdk) => sdk.resolution.upgradeResolver,
);
