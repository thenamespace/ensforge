// Wire shapes of bigname's REST API (OpenAPI snapshot `packages/sdk/test/fixtures/openapi/bigname.json`), as
// recorded responses carry them: snake_case keys, decimal strings for timestamps. Only the fields
// the fixtures use are typed; servers send more, and the SDK must ignore what it does not know.

export type ContractRef = { readonly chain_id: number; readonly address: string };

export type AsOf = {
  readonly block_number: number;
  readonly block_hash: string;
  readonly timestamp: string;
};

export type Meta = {
  readonly as_of?: Readonly<Record<string, AsOf>>;
  readonly as_of_completeness?: Readonly<Record<string, string>>;
  readonly as_of_token?: string | null;
  readonly completeness?: "full" | "partial" | "unsupported";
  readonly source?: "indexed" | "verified";
  readonly unsupported_reason?: string;
  readonly unsupported_fields?: readonly string[];
  readonly unlisted_permission_surfaces?: readonly string[];
};

export type Page = {
  readonly cursor: string | null;
  readonly next_cursor: string | null;
  readonly page_size: number;
  readonly total_count: number | null;
  readonly has_more: boolean;
};

/** `{ data, meta, page }`, as every route answers. */
export type Envelope<data = unknown> = {
  readonly data: data;
  readonly meta?: Meta;
  readonly page?: Page;
};

/** bigname's error body, shared by compatible servers. */
export type ErrorEnvelope = {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details: Readonly<Record<string, unknown>>;
  };
};

export type EnsV1 = {
  readonly resolver: ContractRef | null;
  readonly expires_at?: string | null;
  readonly wrapper_state?: string;
  readonly wrapper_expires_at?: string | null;
  readonly wrapper_fuses?: { readonly fuses: number } & Readonly<Record<string, unknown>>;
};

export type SearchName = {
  readonly name: string;
  readonly display_name: string;
  readonly namespace: string;
  readonly namehash: string;
  readonly status: string;
  readonly authority?: string;
  readonly owner?: string;
  readonly manager?: string;
  readonly registered_at?: string;
  readonly created_at?: string;
  readonly expires_at?: string | null;
  readonly grace_ends_at?: string | null;
  readonly expires_at_reason?: string;
  readonly ens_v1?: EnsV1;
  readonly expires_window_index?: number;
  readonly grace_ends_window_index?: number;
};

export type RecordGroups = {
  readonly texts: Readonly<Record<string, string | null>>;
  readonly addresses: Readonly<Record<string, string | null>>;
  readonly contenthash?: string | null;
  readonly name?: string | null;
  readonly seen_texts: readonly string[];
  readonly seen_addresses: readonly string[];
  readonly abis: Readonly<Record<string, unknown>>;
  readonly seen_singletons: readonly string[];
};

export type NameRecord = Omit<SearchName, "status"> & {
  readonly status?: string;
  readonly read_status: string;
  readonly chain_id?: number;
  readonly network?: string;
  readonly registration_id?: string;
  readonly token_id?: string;
  readonly resolver?: ContractRef;
  readonly subregistry?: ContractRef;
  readonly primary_address?: string;
  readonly migrated_at?: string;
  readonly records?: RecordGroups;
  readonly record_count?: number;
  readonly subname_count?: number;
  readonly canonical_name?: string;
  readonly is_primary?: boolean;
};

export type AddressName = SearchName & {
  readonly relations: readonly string[];
  readonly is_primary: boolean;
  readonly migrated_at?: string;
  readonly record_count?: number;
  readonly subname_count?: number;
};

export type Subname = SearchName & {
  readonly labelhash?: string;
  readonly subname_count?: number;
  readonly subregistry?: ContractRef;
  readonly role_holder_count?: number;
};

export type HistoryEvent = {
  readonly id: string;
  readonly type: string;
  readonly name?: string;
  readonly namespace: string;
  readonly subject?: string;
  readonly kind?: string;
  readonly registration_id: string | null;
  readonly contract_address?: string | null;
  readonly block_number: number | null;
  readonly timestamp: string | null;
  readonly transaction_hash: string | null;
  readonly log_index: number | null;
  readonly data?: Readonly<Record<string, unknown>>;
};

export type RecordAnswer = {
  readonly status: string;
  readonly value?: string;
  readonly failure_reason?: string;
  readonly unsupported_reason?: string;
};

export type NameRecords = {
  readonly namespace: string;
  readonly resolver: ContractRef | null;
  readonly records: Readonly<Record<string, RecordAnswer>>;
  readonly inventory?: {
    readonly known_keys: readonly string[];
    readonly unset_keys: readonly string[];
    readonly unsupported_keys: readonly string[];
    readonly abi_content_types: readonly number[] | null;
  };
};

export type PrimaryName = {
  readonly address: string;
  readonly coin_type: number;
  readonly namespace: string;
  readonly answers: readonly {
    readonly source: string;
    readonly status: string;
    readonly name?: string;
    readonly failure_reason?: string;
  }[];
  readonly verification?: { readonly status: string; readonly name?: string };
};

export type LookupResult = {
  readonly input: { readonly name?: string; readonly address?: string };
  readonly kind: string;
  readonly status: string;
  readonly record?: NameRecord;
  readonly records?: readonly NameRecord[];
  readonly failure_reason?: string;
};

export type PermissionRow = {
  readonly address: string;
  readonly name?: string;
  readonly registration_id: string;
  readonly powers: readonly string[];
  readonly grant_scope: {
    readonly kind: string;
    readonly detail: Readonly<Record<string, unknown>>;
  };
  readonly grant_relation?: string;
  readonly wrapper_state?: string;
  readonly authority_context: string;
  readonly lineage?: Readonly<Record<string, unknown>>;
};

export type RegistryOverview = {
  readonly chain_id: number;
  readonly address: string;
  readonly name: { readonly name: string; readonly display_name: string } | null;
  readonly parent_registry: ContractRef | null;
  readonly created_block_number: number | null;
  readonly created_at: string | null;
  readonly created_transaction_hash: string | null;
  readonly created_basis: string;
  readonly counts?: {
    readonly labels: number | null;
    readonly roles: number | null;
    readonly events: number | null;
  };
  readonly referenced_by: {
    readonly data: readonly { readonly name: string }[];
    readonly page: Page;
  };
};

export type ResolverOverview = {
  readonly chain_id: number;
  readonly address: string;
  readonly bound_names: { readonly data: readonly NameRecord[]; readonly page: Page };
  readonly mirror?: { readonly kind: string; readonly registry: ContractRef };
};

export type ResolverLink = {
  readonly name?: string;
  readonly namehash: string;
  readonly record_id: string;
  readonly default: boolean;
  readonly link_event: { readonly block_number?: number; readonly transaction_hash?: string };
};

export type ResolverRole = {
  readonly address: string;
  readonly name?: string;
  readonly registration_id: string;
  readonly powers: readonly string[];
  readonly grant_event?: { readonly block_number: number | null };
};

export type RoleHolderResolver = {
  readonly chain_id: number;
  readonly address: string;
  readonly grant_count: number;
  readonly powers: readonly string[];
};

export type NamespaceData = {
  readonly namespace: string;
  readonly capabilities: Readonly<Record<string, { readonly completeness: string }>>;
  readonly networks: readonly {
    readonly network: string;
    readonly chain_id?: number;
    readonly resolution?: { readonly protocol: string; readonly since_block: number | null };
  }[];
};

export type ChainStatus = {
  readonly status: string;
  readonly latest_block: number | null;
  readonly indexed_block: number | null;
  readonly safe_block: number | null;
  readonly finalized_block: number | null;
  readonly lag_blocks: number | null;
  readonly lag_seconds: number | null;
  readonly network_head_status: string;
};

export type StatusData = {
  readonly status: string;
  readonly pending_invalidation_count: number;
  readonly pending_invalidation_count_capped: boolean;
  readonly dead_letter_count: number;
  readonly chains: Readonly<Record<string, ChainStatus>>;
};
