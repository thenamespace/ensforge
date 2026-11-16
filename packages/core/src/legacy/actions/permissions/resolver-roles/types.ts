import type { EnsWriteIntent } from "../../../action/write-intent.js";
import type { ResolverRecord } from "../../../internal/capabilities/resolver-resource.js";
import type { CallExecutionResult, WriteError } from "../../../write/types.js";

export interface ResolverRolesMutationParameters {
  readonly name: string;
  readonly account: string;
  readonly record: ResolverRecord;
  readonly roles?: bigint;
}

export interface ResolverRootRolesMutationParameters {
  readonly name: string;
  readonly account: string;
  readonly roles: bigint;
}

export type GrantResolverRolesParameters = ResolverRolesMutationParameters;

export type RevokeResolverRolesParameters = ResolverRolesMutationParameters;

export type GrantResolverRootRolesParameters = ResolverRootRolesMutationParameters;

export type RevokeResolverRootRolesParameters = ResolverRootRolesMutationParameters;

export type GrantResolverRolesResult = CallExecutionResult;

export type RevokeResolverRolesResult = CallExecutionResult;

export type GrantResolverRootRolesResult = CallExecutionResult;

export type RevokeResolverRootRolesResult = CallExecutionResult;

export type GrantResolverRolesError = WriteError;

export type RevokeResolverRolesError = WriteError;

export type GrantResolverRootRolesError = WriteError;

export type RevokeResolverRootRolesError = WriteError;

export type GrantResolverRolesIntent = EnsWriteIntent<
  GrantResolverRolesResult,
  GrantResolverRolesError
>;

export type RevokeResolverRolesIntent = EnsWriteIntent<
  RevokeResolverRolesResult,
  RevokeResolverRolesError
>;

export type GrantResolverRootRolesIntent = EnsWriteIntent<
  GrantResolverRootRolesResult,
  GrantResolverRootRolesError
>;

export type RevokeResolverRootRolesIntent = EnsWriteIntent<
  RevokeResolverRootRolesResult,
  RevokeResolverRootRolesError
>;
