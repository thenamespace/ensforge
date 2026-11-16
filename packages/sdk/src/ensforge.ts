import {
  createConfig,
  EnsforgeConfigTypeId,
  type CreateConfigParameters,
  type EnsforgeConfig,
} from "@ensforge/core/legacy";
import { createMemoryWorkflowStorage } from "@ensforge/core/legacy/storage";

import {
  makeBatchActions,
  makeWorkflowActions,
  type WorkflowActions,
  makeHcaActions,
  type HcaActions,
  makeEventsActions,
  makeIndexerActions,
  type BatchActions,
  type EventsActions,
  type IndexerActions,
} from "./groups/index.js";

export class Ensforge {
  readonly config: EnsforgeConfig;
  readonly hca: HcaActions;
  readonly batch: BatchActions;
  readonly workflows: WorkflowActions;
  readonly events: EventsActions;
  readonly indexer: IndexerActions;

  constructor(parameters: CreateConfigParameters | EnsforgeConfig) {
    const storage = parameters.storage ?? createMemoryWorkflowStorage();
    let config: EnsforgeConfig;

    if (!(EnsforgeConfigTypeId in parameters)) {
      config = createConfig({ ...parameters, storage });
    } else if (parameters.storage) {
      config = parameters;
    } else {
      // Preserve the non-enumerable Effect service context, including Wagmi wallet resolution.
      config = Object.freeze(
        Object.create(Object.getPrototypeOf(parameters), {
          ...Object.getOwnPropertyDescriptors(parameters),
          storage: { value: storage, enumerable: true },
        }),
      ) as EnsforgeConfig;
    }

    this.config = config;
    this.hca = makeHcaActions(config);
    this.batch = makeBatchActions(config);
    this.workflows = makeWorkflowActions(config);
    this.events = makeEventsActions(config);
    this.indexer = makeIndexerActions(config);

    Object.freeze(this);
  }
}
