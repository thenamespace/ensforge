export { createExecutionAdapter } from "./create-execution-adapter.js";
export { requireExecutionExtension } from "./extensions.js";
export type * from "./types.js";
export {
  HcaExecutionCapabilities,
  HcaExecutionReview,
  HcaExecutionFee,
  HcaExecutionLocator,
} from "@ensforge/core/legacy/hca";
export {
  createMemoryHcaRegistrationStorage,
  serializeHcaRegistration,
  restoreHcaRegistration,
} from "./registration/storage.js";
export {
  HcaRegistrationOperation,
  HcaRegistrationLimits,
  HcaRegistrationProgress,
} from "@ensforge/core/legacy/hca";
export type { HcaRegistrationStorage, HcaRegistrationExecution } from "@ensforge/core/legacy/hca";

export { createMemoryHcaStorage, type HcaStorage, type HcaStoredRecord } from "./storage.js";
