# Edge-case catalog and coverage ledger

- `cases.json`: every name edge case ensforge's tests must account for. Single-letter axes are the
  edge-case catalog (labels L, hierarchy H, ownership O, wrapper and roles W, resolvers R, gateways
  X, records K, primary names P, registration G, time T, DNS D, migration M, accounts A, HCA Z,
  network F, indexer I); `M:` axes are the name coverage matrix (ownership `M:A`, resolution `M:B`,
  hierarchy `M:C`, accounts `M:D`, time `M:E`, network `M:F`). Cases marked `bug` are where SDKs
  are likely to be wrong; each deserves its own regression test.
- `ledger.json`: per case, `{ "na": reason }`, `{ "status": "pending" }`, or
  `{ "tests": ["<file> > <title>"] }` once tests tag the case (`meta: { cases: ["O08"] }`).
- Fixtures declare the cases they seed (`src/fixtures/*`); tests select them with
  `fixtures.forCase("O08")`.

`test/unit/ledger.test.ts` (part of `pnpm test`) fails when a case has no entry, a reference is
stale, or a fixture claims an unknown or non-applicable case.

## Decided semantics

Where sources disagree, ensforge documents and tests one meaning:

- **Normalization** (L01–L29) is ens-normalize's behaviour, tested upstream; ensforge calls it and
  does not re-test it.
- **Zero-address records** (K03, K04): ensforge reports what the resolver returns. An explicit
  zero address is a value (it blocks the default-EVM fallback), not "unset"; indexers that treat it
  as missing are documented as differing (I-axis tests in 024).
- **Boundary seconds** (T01–T05), from the contracts: a v1 `.eth` name is expired at its expiry
  second (`expiry > now` to own) and renewable through `expiry + 90 days` inclusive; a wrapped name
  is not expired at its wrapper expiry second; an ENSv2 name is expired at its expiry second
  (`now >= expiry`); ENSv2 grace holds while `now - expiry < 28 days`.
- **Expired PCC child under a live parent** (W05) is seedable (`NameWrapper._normaliseExpiry` only
  caps at the parent's expiry): `v1.wrapped.sub.expired-emancipated`.
- **Re-registration creates a new resource** (O15, O17), as the contracts-v2 tests show; its
  indexing doc says otherwise.

Verified on chain while seeding (the self-checks failed until these were encoded):

- A v1 registry record whose owner was cleared reads owner `0` (the registry stores itself), still
  exists, keeps its resolver, and never falls back to the 2017 registry (O12).
- An expired parent-controlled wrapped subname keeps its owner in `getData`; only emancipated
  names lose owner and fuses at expiry (W09).
- ENSv2 grace is the registrar's: the registry already reports a name in grace as AVAILABLE, while
  the ETHRegistrar refuses to register it until grace ends (T05).
- ETHRenewerV1 renews only ENSv1 names ENSv2 reserved for them (premigrated), or reserved ones in
  ENSv2 grace; an ENSv1 name without a reservation cannot be renewed after the launch (G12).
