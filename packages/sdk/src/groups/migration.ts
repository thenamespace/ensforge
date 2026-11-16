import {
  approveMigration,
  getMigrationEligibility,
  getMigrationPlan,
  getMigrationStatus,
  getMigrationTarget,
  migrateName,
  migrateNames,
  type EnsforgeConfig,
} from "@ensforge/core/legacy";

import { bindAction, type BoundAction } from "../internal/bind-action.js";

export interface MigrationActions {
  readonly approveMigration: BoundAction<typeof approveMigration>;
  readonly getMigrationEligibility: BoundAction<typeof getMigrationEligibility>;
  readonly getMigrationPlan: BoundAction<typeof getMigrationPlan>;
  readonly getMigrationStatus: BoundAction<typeof getMigrationStatus>;
  readonly getMigrationTarget: BoundAction<typeof getMigrationTarget>;
  readonly migrateName: BoundAction<typeof migrateName>;
  readonly migrateNames: BoundAction<typeof migrateNames>;
}

export const makeMigrationActions = (config: EnsforgeConfig): MigrationActions =>
  Object.freeze({
    approveMigration: bindAction(config, approveMigration),
    getMigrationEligibility: bindAction(config, getMigrationEligibility),
    getMigrationPlan: bindAction(config, getMigrationPlan),
    getMigrationStatus: bindAction(config, getMigrationStatus),
    getMigrationTarget: bindAction(config, getMigrationTarget),
    migrateName: bindAction(config, migrateName),
    migrateNames: bindAction(config, migrateNames),
  });
