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
  makeCapabilitiesActions,
  makeDnsActions,
  makeEventsActions,
  makeIndexerActions,
  makeMigrationActions,
  makePermissionsActions,
  makeWrappingActions,
  type BatchActions,
  type CapabilitiesActions,
  type DnsActions,
  type EventsActions,
  type IndexerActions,
  type MigrationActions,
  type PermissionsActions,
  type WrappingActions,
} from "./groups/index.js";

export class Ensforge {
  readonly config: EnsforgeConfig;
  readonly hca: HcaActions;
  readonly batch: BatchActions;
  readonly workflows: WorkflowActions;
  readonly capabilities: CapabilitiesActions;
  readonly dns: DnsActions;
  readonly events: EventsActions;
  readonly indexer: IndexerActions;
  readonly migration: MigrationActions;
  readonly permissions: PermissionsActions;
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
    this.capabilities = makeCapabilitiesActions(config);
    this.dns = makeDnsActions(config);
    this.events = makeEventsActions(config);
    this.indexer = makeIndexerActions(config);
    this.migration = makeMigrationActions(config);
    this.permissions = makePermissionsActions(config);
    this.wrapping = makeWrappingActions(config);

    Object.freeze(this);
  }
}
