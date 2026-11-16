import {
  claimDnsName,
  getDnsClaimStatus,
  getDnsImportPlan,
  getDnsRecord,
  getDnsRecords,
  getZoneHash,
  hasDnsRecords,
  importDnsName,
  setDnsRecords,
  setZoneHash,
  type EnsforgeConfig,
} from "@ensforge/core/legacy";

import { bindAction, type BoundAction } from "../internal/bind-action.js";

export interface DnsActions {
  readonly claimDnsName: BoundAction<typeof claimDnsName>;
  readonly getDnsClaimStatus: BoundAction<typeof getDnsClaimStatus>;
  readonly getDnsImportPlan: BoundAction<typeof getDnsImportPlan>;
  readonly getDnsRecord: BoundAction<typeof getDnsRecord>;
  readonly getDnsRecords: BoundAction<typeof getDnsRecords>;
  readonly getZoneHash: BoundAction<typeof getZoneHash>;
  readonly hasDnsRecords: BoundAction<typeof hasDnsRecords>;
  readonly importDnsName: BoundAction<typeof importDnsName>;
  readonly setDnsRecords: BoundAction<typeof setDnsRecords>;
  readonly setZoneHash: BoundAction<typeof setZoneHash>;
}

export const makeDnsActions = (config: EnsforgeConfig): DnsActions =>
  Object.freeze({
    claimDnsName: bindAction(config, claimDnsName),
    getDnsClaimStatus: bindAction(config, getDnsClaimStatus),
    getDnsImportPlan: bindAction(config, getDnsImportPlan),
    getDnsRecord: bindAction(config, getDnsRecord),
    getDnsRecords: bindAction(config, getDnsRecords),
    getZoneHash: bindAction(config, getZoneHash),
    hasDnsRecords: bindAction(config, hasDnsRecords),
    importDnsName: bindAction(config, importDnsName),
    setDnsRecords: bindAction(config, setDnsRecords),
    setZoneHash: bindAction(config, setZoneHash),
  });
