import {
  extendSubnameExpiry,
  getFuses,
  getWrapperExpiry,
  setChildFuses,
  setFuses,
  unwrapName,
  wrapName,
  type EnsforgeConfig,
} from "@ensforge/core/legacy";

import { bindAction, type BoundAction } from "../internal/bind-action.js";

export interface WrappingActions {
  readonly extendSubnameExpiry: BoundAction<typeof extendSubnameExpiry>;
  readonly getFuses: BoundAction<typeof getFuses>;
  readonly getWrapperExpiry: BoundAction<typeof getWrapperExpiry>;
  readonly setChildFuses: BoundAction<typeof setChildFuses>;
  readonly setFuses: BoundAction<typeof setFuses>;
  readonly unwrapName: BoundAction<typeof unwrapName>;
  readonly wrapName: BoundAction<typeof wrapName>;
}

export const makeWrappingActions = (config: EnsforgeConfig): WrappingActions =>
  Object.freeze({
    extendSubnameExpiry: bindAction(config, extendSubnameExpiry),
    getFuses: bindAction(config, getFuses),
    getWrapperExpiry: bindAction(config, getWrapperExpiry),
    setChildFuses: bindAction(config, setChildFuses),
    setFuses: bindAction(config, setFuses),
    unwrapName: bindAction(config, unwrapName),
    wrapName: bindAction(config, wrapName),
  });
