import {
  getCanonicalResource,
  getExpiry,
  getManager,
  getNameState,
  getNameStatus,
  getOwner,
  getProtocol,
  getRegistrant,
  getRegistry,
  getTokenId,
  isAvailable,
  isMigrated,
  isRenewable,
  isReserved,
  isWrapped,
  type EnsforgeConfig,
} from "@ensforge/core/legacy";

import { bindAction, type BoundAction } from "../internal/bind-action.js";

export interface NameActions {
  readonly getCanonicalResource: BoundAction<typeof getCanonicalResource>;
  readonly getExpiry: BoundAction<typeof getExpiry>;
  readonly getManager: BoundAction<typeof getManager>;
  readonly getNameState: BoundAction<typeof getNameState>;
  readonly getNameStatus: BoundAction<typeof getNameStatus>;
  readonly getOwner: BoundAction<typeof getOwner>;
  readonly getProtocol: BoundAction<typeof getProtocol>;
  readonly getRegistrant: BoundAction<typeof getRegistrant>;
  readonly getRegistry: BoundAction<typeof getRegistry>;
  readonly getTokenId: BoundAction<typeof getTokenId>;
  readonly isAvailable: BoundAction<typeof isAvailable>;
  readonly isMigrated: BoundAction<typeof isMigrated>;
  readonly isRenewable: BoundAction<typeof isRenewable>;
  readonly isReserved: BoundAction<typeof isReserved>;
  readonly isWrapped: BoundAction<typeof isWrapped>;
}

export const makeNameActions = (config: EnsforgeConfig): NameActions =>
  Object.freeze({
    getCanonicalResource: bindAction(config, getCanonicalResource),
    getExpiry: bindAction(config, getExpiry),
    getManager: bindAction(config, getManager),
    getNameState: bindAction(config, getNameState),
    getNameStatus: bindAction(config, getNameStatus),
    getOwner: bindAction(config, getOwner),
    getProtocol: bindAction(config, getProtocol),
    getRegistrant: bindAction(config, getRegistrant),
    getRegistry: bindAction(config, getRegistry),
    getTokenId: bindAction(config, getTokenId),
    isAvailable: bindAction(config, isAvailable),
    isMigrated: bindAction(config, isMigrated),
    isRenewable: bindAction(config, isRenewable),
    isReserved: bindAction(config, isReserved),
    isWrapped: bindAction(config, isWrapped),
  });
