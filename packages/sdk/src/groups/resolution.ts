import {
  createResolver,
  getOrCreateResolver,
  getResolver,
  getResolverVersion,
  predictResolverAddress,
  resolve,
  resolveBatch,
  resolveWithResolver,
  setResolver,
  setResolverAndRecords,
  upgradeResolver,
  type EnsforgeConfig,
} from "@ensforge/core/legacy";

import { bindAction, type BoundAction } from "../internal/bind-action.js";

export interface ResolutionActions {
  readonly createResolver: BoundAction<typeof createResolver>;
  readonly getOrCreateResolver: BoundAction<typeof getOrCreateResolver>;
  readonly getResolver: BoundAction<typeof getResolver>;
  readonly getResolverVersion: BoundAction<typeof getResolverVersion>;
  readonly predictResolverAddress: BoundAction<typeof predictResolverAddress>;
  readonly resolve: BoundAction<typeof resolve>;
  readonly resolveBatch: BoundAction<typeof resolveBatch>;
  readonly resolveWithResolver: BoundAction<typeof resolveWithResolver>;
  readonly setResolver: BoundAction<typeof setResolver>;
  readonly setResolverAndRecords: BoundAction<typeof setResolverAndRecords>;
  readonly upgradeResolver: BoundAction<typeof upgradeResolver>;
}

export const makeResolutionActions = (config: EnsforgeConfig): ResolutionActions =>
  Object.freeze({
    createResolver: bindAction(config, createResolver),
    getOrCreateResolver: bindAction(config, getOrCreateResolver),
    getResolver: bindAction(config, getResolver),
    getResolverVersion: bindAction(config, getResolverVersion),
    predictResolverAddress: bindAction(config, predictResolverAddress),
    resolve: bindAction(config, resolve),
    resolveBatch: bindAction(config, resolveBatch),
    resolveWithResolver: bindAction(config, resolveWithResolver),
    setResolver: bindAction(config, setResolver),
    setResolverAndRecords: bindAction(config, setResolverAndRecords),
    upgradeResolver: bindAction(config, upgradeResolver),
  });
