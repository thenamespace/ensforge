"use client";

export type {
  CreateConfigParameters,
  CreateViemConfigParameters,
  EnsforgeConfig,
} from "@ensforge/sdk/legacy";
export { Ensforge } from "./legacy/ensforge.js";
export type { CreateWagmiConfigParameters } from "./legacy/wagmi.js";

export * from "./cache/index.js";
export * from "./hooks/index.js";
export {
  defaultEnsAtomOptions,
  type EnsAtomDefaults,
  type EnsAtomOptions,
  type EnsAtomSwrOptions,
  type ResolvedEnsAtomOptions,
  type ResolvedEnsAtomSwrOptions,
  type UseEnsAtomParameters,
} from "./query/options.js";
export { type EnsAtomResult } from "./query/result.js";
export type {
  EnsMutationDefaults,
  EnsMutationExecutionOptions,
  EnsMutationOptions,
} from "./mutation/options.js";
export type { EnsMutationResult } from "./mutation/result.js";
export * from "./provider/index.js";
