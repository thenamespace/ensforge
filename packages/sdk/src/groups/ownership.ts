import {
  getTtl,
  reclaimName,
  setManager,
  setTtl,
  transferName,
  transferRegistrant,
  type EnsforgeConfig,
} from "@ensforge/core/legacy";

import { bindAction, type BoundAction } from "../internal/bind-action.js";

export interface OwnershipActions {
  readonly getTtl: BoundAction<typeof getTtl>;
  readonly reclaimName: BoundAction<typeof reclaimName>;
  readonly setManager: BoundAction<typeof setManager>;
  readonly setTtl: BoundAction<typeof setTtl>;
  readonly transferName: BoundAction<typeof transferName>;
  readonly transferRegistrant: BoundAction<typeof transferRegistrant>;
}

export const makeOwnershipActions = (config: EnsforgeConfig): OwnershipActions =>
  Object.freeze({
    getTtl: bindAction(config, getTtl),
    reclaimName: bindAction(config, reclaimName),
    setManager: bindAction(config, setManager),
    setTtl: bindAction(config, setTtl),
    transferName: bindAction(config, transferName),
    transferRegistrant: bindAction(config, transferRegistrant),
  });
