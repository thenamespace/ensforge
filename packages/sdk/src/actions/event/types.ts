import type { Address, Hex } from "viem";

/**
 * Event category, as the bigname indexer names it.
 *
 * @category events
 * @since 1.0.0
 */
export type EventType =
  | "registration"
  | "renewal"
  | "release"
  | "expiry"
  | "transfer"
  | "authority"
  | "resolver"
  | "record"
  | "primary_name"
  | "permission"
  | "subregistry"
  | "migration"
  | "reservation"
  | "token"
  | "contract";

/**
 * What the event did, as the bigname indexer names it.
 *
 * @category events
 * @since 1.0.0
 */
export type EventAction =
  | "registration_granted"
  | "registration_renewed"
  | "registration_released"
  | "registration_reserved"
  | "expiry_changed"
  | "token_transferred"
  | "token_regenerated"
  | "authority_changed"
  | "resolver_changed"
  | "record_changed"
  | "record_version_changed"
  | "resolver_record_linked"
  | "primary_name_recorded"
  | "reverse_claimed"
  | "permission_changed"
  | "operator_approval_changed"
  | "subregistry_changed"
  | "migration_applied"
  | "name_wrapped"
  | "name_unwrapped"
  | "registry_created"
  | "registry_parent_changed"
  | "contract_upgraded";

/**
 * One ENS event, normalized across ENSv1 and ENSv2.
 *
 * @category events
 * @since 1.0.0
 */
export type Event = {
  readonly type: EventType;
  readonly action: EventAction;
  /** Solidity event name, e.g. `LabelRegistered`. */
  readonly event: string;
  /** Protocol of the emitting contract; `null` for resolvers ensforge does not know. */
  readonly protocol: "v1" | "v2" | null;
  /** Emitting contract. */
  readonly contract: Address;
  /** The name the event is about, when the event or the query reveals it. */
  readonly name: string | null;
  /** ENS node the event is keyed by, for node-keyed events. */
  readonly node: Hex | null;
  /** Decoded event arguments. */
  readonly args: Readonly<Record<string, unknown>>;
  readonly blockNumber: bigint;
  readonly transactionHash: Hex;
  readonly logIndex: number;
};
