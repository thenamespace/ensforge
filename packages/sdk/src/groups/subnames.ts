import {
  createSubname,
  deleteSubname,
  setSubnameExpiry,
  setSubnameManager,
  setSubnameRecord,
  setSubnameResolver,
  transferSubname,
  type EnsforgeConfig,
} from "@ensforge/core/legacy";

import { bindAction, type BoundAction } from "../internal/bind-action.js";

export interface SubnameActions {
  readonly createSubname: BoundAction<typeof createSubname>;
  readonly deleteSubname: BoundAction<typeof deleteSubname>;
  readonly setSubnameExpiry: BoundAction<typeof setSubnameExpiry>;
  readonly setSubnameManager: BoundAction<typeof setSubnameManager>;
  readonly setSubnameRecord: BoundAction<typeof setSubnameRecord>;
  readonly setSubnameResolver: BoundAction<typeof setSubnameResolver>;
  readonly transferSubname: BoundAction<typeof transferSubname>;
}

export const makeSubnameActions = (config: EnsforgeConfig): SubnameActions =>
  Object.freeze({
    createSubname: bindAction(config, createSubname),
    deleteSubname: bindAction(config, deleteSubname),
    setSubnameExpiry: bindAction(config, setSubnameExpiry),
    setSubnameManager: bindAction(config, setSubnameManager),
    setSubnameRecord: bindAction(config, setSubnameRecord),
    setSubnameResolver: bindAction(config, setSubnameResolver),
    transferSubname: bindAction(config, transferSubname),
  });
