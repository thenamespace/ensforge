import { Effect, Schema } from "effect";

import { IndexerError } from "../../errors/classes/IndexerError.js";

// bigname's REST shapes, shared by every bigname-compatible indexer (Goldsky serves the same
// routes with fewer fields). Each exported Struct is named after the OpenAPI component it decodes;
// `scripts/indexer-openapi.ts check` verifies its fields against the pinned specs. Only identity fields are required: anything one indexer leaves out
// decodes as missing, and unknown fields are ignored. Enum-like strings stay strings so a new
// value upstream does not fail a whole page.

const opt = <S extends Schema.Top>(schema: S) => Schema.optional(Schema.NullOr(schema));

export const ContractRef = Schema.Struct({ chain_id: Schema.Number, address: Schema.String });

const AsOf = Schema.Struct({
  block_number: Schema.Number,
  block_hash: Schema.String,
  timestamp: Schema.String,
});

export const Meta = Schema.Struct({
  as_of: opt(Schema.Record(Schema.String, AsOf)),
  as_of_token: opt(Schema.String),
  completeness: opt(Schema.String),
  source: opt(Schema.String),
  unsupported_reason: opt(Schema.String),
  unsupported_fields: opt(Schema.Array(Schema.String)),
  unlisted_permission_surfaces: opt(Schema.Array(Schema.String)),
});

export const Page = Schema.Struct({
  next_cursor: opt(Schema.String),
  has_more: opt(Schema.Boolean),
  total_count: opt(Schema.Number),
});

export const EnsV1 = Schema.Struct({
  resolver: opt(ContractRef),
  expires_at: opt(Schema.String),
  wrapper_state: opt(Schema.String),
  wrapper_expires_at: opt(Schema.String),
  wrapper_fuses: opt(Schema.Struct({ fuses: Schema.Number })),
});

const nameFields = {
  name: Schema.String,
  display_name: opt(Schema.String),
  namespace: opt(Schema.String),
  namehash: Schema.String,
  status: opt(Schema.String),
  authority: opt(Schema.String),
  owner: opt(Schema.String),
  manager: opt(Schema.String),
  registered_at: opt(Schema.String),
  created_at: opt(Schema.String),
  expires_at: opt(Schema.String),
  grace_ends_at: opt(Schema.String),
  expires_at_reason: opt(Schema.String),
  ens_v1: opt(EnsV1),
};

export const RecordGroups = Schema.Struct({
  texts: opt(Schema.Record(Schema.String, Schema.NullOr(Schema.String))),
  addresses: opt(Schema.Record(Schema.String, Schema.NullOr(Schema.String))),
  contenthash: opt(Schema.String),
  name: opt(Schema.String),
  seen_texts: opt(Schema.Array(Schema.String)),
  seen_addresses: opt(Schema.Array(Schema.String)),
});

const detailFields = {
  ...nameFields,
  chain_id: opt(Schema.Number),
  registration_id: opt(Schema.String),
  token_id: opt(Schema.String),
  resolver: opt(ContractRef),
  subregistry: opt(ContractRef),
  primary_address: opt(Schema.String),
  migrated_at: opt(Schema.String),
  records: opt(RecordGroups),
  read_status: opt(Schema.String),
  unsupported_reason: opt(Schema.String),
  failure_reason: opt(Schema.String),
};

export const NameRecord = Schema.Struct({
  ...detailFields,
  record_count: opt(Schema.Number),
  subname_count: opt(Schema.Number),
});

export const LookupRecord = Schema.Struct({ ...detailFields, is_primary: opt(Schema.Boolean) });

export const AddressName = Schema.Struct({
  ...nameFields,
  relations: opt(Schema.Array(Schema.String)),
  is_primary: opt(Schema.Boolean),
  migrated_at: opt(Schema.String),
  record_count: opt(Schema.Number),
  subname_count: opt(Schema.Number),
});

const subnameFields = {
  ...nameFields,
  labelhash: opt(Schema.String),
  subname_count: opt(Schema.Number),
  subregistry: opt(ContractRef),
};

export const Subname = Schema.Struct(subnameFields);

export const RegistryLabel = Schema.Struct({
  ...subnameFields,
  role_holder_count: opt(Schema.Number),
});

export const SearchName = Schema.Struct({
  ...nameFields,
  expires_window_index: opt(Schema.Number),
  grace_ends_window_index: opt(Schema.Number),
});

export const HistoryEvent = Schema.Struct({
  id: Schema.String,
  type: Schema.String,
  // `/events` leaves it out when filtering by name.
  name: opt(Schema.String),
  namespace: opt(Schema.String),
  subject: opt(Schema.String),
  kind: opt(Schema.String),
  registration_id: opt(Schema.String),
  contract_address: opt(Schema.String),
  block_number: opt(Schema.Number),
  timestamp: opt(Schema.String),
  transaction_hash: opt(Schema.String),
  log_index: opt(Schema.Number),
  data: opt(Schema.Record(Schema.String, Schema.Unknown)),
});

const RecordAnswer = Schema.Struct({
  status: Schema.String,
  value: opt(Schema.String),
  failure_reason: opt(Schema.String),
  unsupported_reason: opt(Schema.String),
});

export const NameRecords = Schema.Struct({
  namespace: opt(Schema.String),
  resolver: opt(ContractRef),
  records: opt(Schema.Record(Schema.String, RecordAnswer)),
  inventory: opt(
    Schema.Struct({
      known_keys: opt(Schema.Array(Schema.String)),
      unset_keys: opt(Schema.Array(Schema.String)),
      unsupported_keys: opt(Schema.Array(Schema.String)),
    }),
  ),
});

const PrimaryNameAnswer = Schema.Struct({
  source: Schema.String,
  status: Schema.String,
  name: opt(Schema.String),
  failure_reason: opt(Schema.String),
  unsupported_reason: opt(Schema.String),
});

export const PrimaryName = Schema.Struct({
  address: Schema.String,
  coin_type: Schema.Number,
  namespace: opt(Schema.String),
  answers: opt(Schema.Array(PrimaryNameAnswer)),
  verification: opt(Schema.Struct({ status: Schema.String, name: opt(Schema.String) })),
});

export const LookupResult = Schema.Struct({
  input: Schema.Struct({ name: opt(Schema.String), address: opt(Schema.String) }),
  kind: Schema.String,
  status: Schema.String,
  record: opt(LookupRecord),
  records: opt(Schema.Array(LookupRecord)),
  failure_reason: opt(Schema.String),
  unsupported_reason: opt(Schema.String),
});

export const PermissionRow = Schema.Struct({
  address: Schema.String,
  name: opt(Schema.String),
  registration_id: Schema.String,
  powers: Schema.Array(Schema.String),
  grant_scope: Schema.Struct({ kind: Schema.String }),
  grant_relation: opt(Schema.String),
  wrapper_state: opt(Schema.String),
  lineage: opt(Schema.Record(Schema.String, Schema.Unknown)),
});

export const RegistryOverview = Schema.Struct({
  chain_id: Schema.Number,
  address: Schema.String,
  name: opt(Schema.Struct({ name: Schema.String })),
  parent_registry: opt(ContractRef),
  created_at: opt(Schema.String),
  created_block_number: opt(Schema.Number),
  created_transaction_hash: opt(Schema.String),
  counts: opt(
    Schema.Struct({
      labels: opt(Schema.Number),
      roles: opt(Schema.Number),
      events: opt(Schema.Number),
    }),
  ),
  referenced_by: opt(Schema.Struct({ data: Schema.Array(Schema.Struct({ name: Schema.String })) })),
});

export const ResolverOverview = Schema.Struct({
  chain_id: Schema.Number,
  address: Schema.String,
  bound_names: opt(
    Schema.Struct({
      data: Schema.Array(Schema.Struct({ name: Schema.String })),
      page: opt(Page),
    }),
  ),
  mirror: opt(Schema.Struct({ registry: ContractRef })),
});

export const ResolverLink = Schema.Struct({
  name: opt(Schema.String),
  namehash: Schema.String,
  record_id: Schema.String,
  default: Schema.Boolean,
  link_event: opt(
    Schema.Struct({ block_number: opt(Schema.Number), transaction_hash: opt(Schema.String) }),
  ),
});

export const ResolverRole = Schema.Struct({
  address: Schema.String,
  name: opt(Schema.String),
  registration_id: Schema.String,
  powers: Schema.Array(Schema.String),
  grant_event: opt(Schema.Struct({ block_number: opt(Schema.Number) })),
});

export const RoleHolderResolver = Schema.Struct({
  chain_id: Schema.Number,
  address: Schema.String,
  grant_count: Schema.Number,
  powers: Schema.Array(Schema.String),
});

export const Namespace = Schema.Struct({
  namespace: Schema.String,
  capabilities: opt(Schema.Record(Schema.String, Schema.Struct({ completeness: Schema.String }))),
  networks: opt(
    Schema.Array(
      Schema.Struct({
        network: Schema.String,
        chain_id: opt(Schema.Number),
        resolution: opt(
          Schema.Struct({ protocol: Schema.String, since_block: opt(Schema.Number) }),
        ),
      }),
    ),
  ),
});

export const ChainStatus = Schema.Struct({
  status: opt(Schema.String),
  indexed_block: opt(Schema.Number),
  latest_block: opt(Schema.Number),
  safe_block: opt(Schema.Number),
  finalized_block: opt(Schema.Number),
  lag_blocks: opt(Schema.Number),
  lag_seconds: opt(Schema.Number),
});

export const StatusData = Schema.Struct({
  status: Schema.String,
  chains: Schema.Record(Schema.String, ChainStatus),
});

/** `{ data, meta, page }`, as every route answers. */
export const envelope = <S extends Schema.Top>(data: S) =>
  Schema.Struct({ data, meta: opt(Meta), page: opt(Page) });

/** Decodes a response body; a mismatch fails with `INDEXER_RESPONSE_INVALID`. */
export const decode = <S extends Schema.Constraint>(
  schema: S,
  body: unknown,
  source: { readonly id: string; readonly route: string },
): Effect.Effect<S["Type"], IndexerError, S["DecodingServices"]> =>
  Schema.decodeUnknownEffect(schema)(body).pipe(
    Effect.mapError(
      (issue) =>
        new IndexerError({
          code: "INDEXER_RESPONSE_INVALID",
          route: source.route,
          source: source.id,
          details: [issue.message],
          cause: issue,
        }),
    ),
  );
