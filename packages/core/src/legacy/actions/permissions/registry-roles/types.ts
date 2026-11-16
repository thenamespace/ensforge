import type { EnsWriteIntent } from "../../../action/write-intent.js";
import type { CallExecutionResult, WriteError } from "../../../write/types.js";

export interface RegistryRolesMutationParameters {
  readonly name: string;
  readonly account: string;
  readonly roles: bigint;
}

export type GrantRegistryRolesParameters = RegistryRolesMutationParameters;

export type RevokeRegistryRolesParameters = RegistryRolesMutationParameters;

export type GrantRegistryRolesResult = CallExecutionResult;

export type RevokeRegistryRolesResult = CallExecutionResult;

export type GrantRegistryRolesError = WriteError;

export type RevokeRegistryRolesError = WriteError;

export type GrantRegistryRolesIntent = EnsWriteIntent<
  GrantRegistryRolesResult,
  GrantRegistryRolesError
>;

export type RevokeRegistryRolesIntent = EnsWriteIntent<
  RevokeRegistryRolesResult,
  RevokeRegistryRolesError
>;
