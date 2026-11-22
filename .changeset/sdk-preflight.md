---
"@ensforge/sdk": minor
---

Writes that would fail late, or succeed while doing nothing, now fail before anything is sent.

- A resolver address without a contract fails with the new `NotFoundError` code `RESOLVER_NOT_DEPLOYED`: in `registration.register` and `registration.commit`, in `record.set` (the given resolver or the name's own), and in `resolver.set`. Calls to such an address succeed without writing anything. `resolver.set({ allowNonContract: true })` still points a name at an address where a resolver will be deployed.
- `registration.register` and `registration.commit` refuse the zero owner (`INVALID_ADDRESS`) and a subregistry address without a contract (`REGISTRY_NOT_FOUND`) before the commitment. Both used to revert only at `register`, after the commitment was paid for and waited out.
- Registration and renewal durations must be at most 100 years, as in the ENS app; a longer or negative one fails with `INVALID_DURATION`. A duration over `2^64` seconds used to throw an untyped error.
