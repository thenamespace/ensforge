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
  makeDnsActions,
  makeEventsActions,
  makeIndexerActions,
  makeMigrationActions,
  makeWrappingActions,
  type BatchActions,
  type DnsActions,
  type EventsActions,
  type IndexerActions,
  type MigrationActions,
  type WrappingActions,
} from "./groups/index.js";

export class Ensforge {
  readonly config: EnsforgeConfig;
  readonly hca: HcaActions;
  readonly batch: BatchActions;
  readonly workflows: WorkflowActions;
  readonly dns: DnsActions;
  readonly events: EventsActions;
  readonly indexer: IndexerActions;
  readonly migration: MigrationActions;
  readonly wrapping: WrappingActions;

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
    this.dns = makeDnsActions(config);
    this.events = makeEventsActions(config);
    this.indexer = makeIndexerActions(config);
    this.migration = makeMigrationActions(config);
    this.wrapping = makeWrappingActions(config);

    Object.freeze(this);
  }
}
