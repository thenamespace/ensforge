import { Predicate, Array as Arr, Option } from "effect";

import { isAddress, isAddressEqual, isHex, type Address, type Hex } from "viem";

import type { EventAction, EventType } from "../../actions/event/types.js";
import type { Client } from "../../client/types.js";
import { dnsDecode } from "../../utils/Name.js";

type Category = { readonly type: EventType; readonly action: EventAction };

const category = (type: EventType, action: EventAction): Category => ({ type, action });

/** Category per Solidity event name; `Transfer` and migrations are decided from the arguments. */
const categories: Readonly<Record<string, Category>> = {
  NewOwner: category("authority", "authority_changed"),
  NewResolver: category("resolver", "resolver_changed"),
  ApprovalForAll: category("permission", "operator_approval_changed"),
  NameRegistered: category("registration", "registration_granted"),
  NameRenewed: category("renewal", "registration_renewed"),
  NameMigrated: category("migration", "migration_applied"),
  NameWrapped: category("token", "name_wrapped"),
  NameUnwrapped: category("token", "name_unwrapped"),
  FusesSet: category("permission", "permission_changed"),
  ExpiryExtended: category("expiry", "expiry_changed"),
  TransferSingle: category("transfer", "token_transferred"),
  TransferBatch: category("transfer", "token_transferred"),
  AddrChanged: category("record", "record_changed"),
  AddressChanged: category("record", "record_changed"),
  TextChanged: category("record", "record_changed"),
  ContenthashChanged: category("record", "record_changed"),
  ContentChanged: category("record", "record_changed"),
  ABIChanged: category("record", "record_changed"),
  InterfaceChanged: category("record", "record_changed"),
  NameChanged: category("record", "record_changed"),
  PubkeyChanged: category("record", "record_changed"),
  DataChanged: category("record", "record_changed"),
  VersionChanged: category("record", "record_version_changed"),
  Approved: category("permission", "permission_changed"),
  ReverseClaimed: category("primary_name", "reverse_claimed"),
  NameForAddrChanged: category("primary_name", "primary_name_recorded"),
  Claim: category("registration", "registration_granted"),
  LabelRegistered: category("registration", "registration_granted"),
  LabelReserved: category("reservation", "registration_reserved"),
  LabelUnregistered: category("release", "registration_released"),
  ExpiryUpdated: category("expiry", "expiry_changed"),
  SubregistryUpdated: category("subregistry", "subregistry_changed"),
  ResolverUpdated: category("resolver", "resolver_changed"),
  TokenRegenerated: category("token", "token_regenerated"),
  ParentUpdated: category("contract", "registry_parent_changed"),
  RegistryCreated: category("contract", "registry_created"),
  EACRolesChanged: category("permission", "permission_changed"),
  Upgraded: category("contract", "contract_upgraded"),
  AddressUpdated: category("record", "record_changed"),
  TextUpdated: category("record", "record_changed"),
  ContenthashUpdated: category("record", "record_changed"),
  ABIUpdated: category("record", "record_changed"),
  InterfaceUpdated: category("record", "record_changed"),
  NameUpdated: category("record", "record_changed"),
  DataUpdated: category("record", "record_changed"),
  Linked: category("record", "resolver_record_linked"),
  Cleared: category("record", "record_version_changed"),
};

/** ENSv2-only events; every other event also exists on ENSv1 contracts. */
const v2Events = new Set([
  "LabelRegistered",
  "LabelReserved",
  "LabelUnregistered",
  "ExpiryUpdated",
  "SubregistryUpdated",
  "ResolverUpdated",
  "TokenRegenerated",
  "ParentUpdated",
  "RegistryCreated",
  "EACRolesChanged",
  "Upgraded",
  "AddressUpdated",
  "TextUpdated",
  "ContenthashUpdated",
  "ABIUpdated",
  "InterfaceUpdated",
  "NameUpdated",
  "DataUpdated",
  "Linked",
  "Cleared",
]);

/** Addresses the deployment knows, by protocol and role. */
export type KnownContracts = {
  readonly v1: readonly Address[];
  readonly v2: readonly Address[];
  readonly graveyard: Address | undefined;
  readonly migrationControllers: readonly Address[];
  /** Registries whose labels sit under a known suffix: `.eth`, or top-level names. */
  readonly suffixes: readonly { readonly registry: Address; readonly suffix: string }[];
};

/** The deployment's ENS contracts, for classifying events by their emitter. */
export const knownContracts = (client: Client): KnownContracts => {
  const v1 = client.deployment.v1;
  const v2 = client.deployment.v2;
  return {
    v1: Arr.filter(
      [
        // oxlint-disable-next-line effecttsgo/prefer-effect-record -- contract maps have optional properties, which `Record.values` does not accept
        ...Object.values(v1?.contracts ?? {}),
        ...(v1?.legacyPublicResolvers ?? []),
        ...(v1?.frozenPublicResolvers ?? []),
      ],
      Predicate.isNotUndefined,
    ),
    v2: Arr.filter(
      // oxlint-disable-next-line effecttsgo/prefer-effect-record -- see above
      [...Object.values(v2?.contracts ?? {}), ...Object.values(v2?.migration ?? {})],
      Predicate.isNotUndefined,
    ),
    graveyard: v2?.migration.graveyard,
    migrationControllers: Arr.filter(
      [v2?.migration.unlockedMigrationController, v2?.migration.lockedMigrationController],
      Predicate.isNotUndefined,
    ),
    suffixes:
      v2 === undefined
        ? []
        : [
            { registry: v2.contracts.ethRegistry, suffix: ".eth" },
            { registry: v2.contracts.rootRegistry, suffix: "" },
          ],
  };
};

const includes = (addresses: readonly Address[], address: unknown): boolean =>
  typeof address === "string" &&
  isAddress(address, { strict: false }) &&
  Arr.some(addresses, (known) => isAddressEqual(known, address));

const toName = (encoded: unknown): string | null => {
  if (!isHex(encoded)) return null;
  try {
    return dnsDecode(encoded);
  } catch {
    return null;
  }
};

/** The category of a decoded ENS event, or `undefined` for events ensforge does not report. */
export const categorize = (
  known: KnownContracts,
  eventName: string,
  args: Readonly<Record<string, unknown>>,
): Category | undefined => {
  // A transfer to the Graveyard is the ENSv1 side of a migration; a registration by a
  // migration controller its ENSv2 side.
  const to = args["owner"] ?? args["to"];
  if (known.graveyard !== undefined && includes([known.graveyard], to)) {
    return category("migration", "migration_applied");
  }
  if (eventName === "LabelRegistered" && includes(known.migrationControllers, args["sender"])) {
    return category("migration", "migration_applied");
  }
  if (eventName === "Transfer") {
    return "node" in args
      ? category("authority", "authority_changed")
      : category("transfer", "token_transferred");
  }
  return categories[eventName];
};

/** The protocol of an event: by emitter when ensforge knows it, else by the event itself. */
export const protocolOf = (
  known: KnownContracts,
  eventName: string,
  contract: Address,
): "v1" | "v2" | null => {
  if (includes(known.v1, contract)) return "v1";
  if (includes(known.v2, contract) || v2Events.has(eventName)) return "v2";
  return null;
};

/** The name an event spells out itself, when it does. */
export const nameOf = (
  known: KnownContracts,
  eventName: string,
  contract: Address,
  args: Readonly<Record<string, unknown>>,
): string | null => {
  const label = typeof args["label"] === "string" ? args["label"] : undefined;
  switch (eventName) {
    case "LabelRegistered":
    case "LabelReserved": {
      const suffix = Option.getOrUndefined(
        Arr.findFirst(known.suffixes, (entry) => isAddressEqual(entry.registry, contract)),
      );
      return label === undefined || suffix === undefined ? null : `${label}${suffix.suffix}`;
    }
    case "NameRegistered":
    case "NameRenewed": {
      // ENSv2 ETHRegistrar / ETHRenewerV1 and ENSv1 controllers spell the `.eth` label. The
      // oldest controllers spell it as `name` and index its hash as `label`.
      const plain = typeof args["name"] === "string" ? args["name"] : label;
      return plain === undefined ? null : `${plain}.eth`;
    }
    case "NameWrapped":
    case "Linked":
      return toName(args["name"]);
    case "Claim":
      return toName(args["dnsname"]);
    default:
      return null;
  }
};

/** The ENS node a node-keyed event names. */
export const nodeOf = (args: Readonly<Record<string, unknown>>): Hex | null => {
  const node = args["node"];
  return isHex(node) && node.length === 66 ? node : null;
};
