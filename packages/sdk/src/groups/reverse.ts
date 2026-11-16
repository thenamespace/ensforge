import {
  clearPrimaryName,
  getPrimaryName,
  setContractPrimaryName,
  setPrimaryName,
  setPrimaryNameForAddress,
  type EnsforgeConfig,
} from "@ensforge/core/legacy";

import { bindAction, type BoundAction } from "../internal/bind-action.js";

export interface ReverseActions {
  readonly clearPrimaryName: BoundAction<typeof clearPrimaryName>;
  readonly getPrimaryName: BoundAction<typeof getPrimaryName>;
  readonly setContractPrimaryName: BoundAction<typeof setContractPrimaryName>;
  readonly setPrimaryName: BoundAction<typeof setPrimaryName>;
  readonly setPrimaryNameForAddress: BoundAction<typeof setPrimaryNameForAddress>;
}

export const makeReverseActions = (config: EnsforgeConfig): ReverseActions =>
  Object.freeze({
    clearPrimaryName: bindAction(config, clearPrimaryName),
    getPrimaryName: bindAction(config, getPrimaryName),
    setContractPrimaryName: bindAction(config, setContractPrimaryName),
    setPrimaryName: bindAction(config, setPrimaryName),
    setPrimaryNameForAddress: bindAction(config, setPrimaryNameForAddress),
  });
