// 0.x client the React package still builds on; replaced by the React rewrite (phase 015).
import {
  createConfig,
  EnsforgeConfigTypeId,
  type CreateConfigParameters,
  type EnsforgeConfig,
} from "@ensforge/sdk/legacy";
import { createMemoryWorkflowStorage } from "@ensforge/sdk/legacy/storage";

export class Ensforge {
  readonly config: EnsforgeConfig;

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

    Object.freeze(this);
  }
}
