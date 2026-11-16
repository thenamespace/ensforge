import {
  getEnsEvents,
  getNameHistory,
  watchEnsEvents,
  type EnsforgeConfig,
} from "@ensforge/core/legacy";

import { bindAction, type BoundAction, type BoundWatchEnsEvents } from "../internal/bind-action.js";

export interface EventsActions {
  readonly getEnsEvents: BoundAction<typeof getEnsEvents>;
  readonly getNameHistory: BoundAction<typeof getNameHistory>;
  readonly watchEnsEvents: BoundWatchEnsEvents;
}

export const makeEventsActions = (config: EnsforgeConfig): EventsActions =>
  Object.freeze({
    getEnsEvents: bindAction(config, getEnsEvents),
    getNameHistory: bindAction(config, getNameHistory),
    watchEnsEvents: bindAction(config, watchEnsEvents),
  });
