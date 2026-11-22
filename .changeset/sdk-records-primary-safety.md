---
"@ensforge/sdk": minor
"@ensforge/contracts": minor
---

Safer record writes, more ABI encodings, and primary-name fixes.

- `record.set({ clear: true })` with nothing else gives a PermissionedResolver name a fresh,
  empty record (a placeholder `description` text) instead of the resolver's default record.
- `record.set({ resolver })` switching to a resolver that already holds records for the name
  starts it on a fresh record there, as `clear: true` would, so shared records are not changed;
  `clear: false` keeps the old merge. Node-keyed resolvers that cannot clear warn
  `RECORDS_MAY_REMAIN`. A refused write is explained against the resolver being switched to.
- `resolver.link({ to: null })` unlinks a name, giving it an empty record of its own.
- ABI records are encoded as zlib (2) or CBOR (4) from an `Abi`, and as a URI (8) from a string.
  Deleting an ABI without a content type clears every content type the resolver holds.
- Setter keying also recognizes resolvers declaring `IAddressSetter`
  (`InterfaceIds.resolver.addressSetter`).
- `primaryName.set({ ensureForward: true })` writes the missing ETH (or default EVM) address
  first instead of failing with `PRIMARY_NAME_MISMATCH`.
- L2 primary names: a client on mainnet sets them on mainnet L2s and one on Sepolia on testnets;
  the other network fails before sending. On Sepolia, `coin: { chainId: 11155111 }` names
  Ethereum. Naming another address on an L2 checks that the signer owns the contract first
  (`NOT_APPROVED`).
- `@ensforge/contracts`: `mainnetL2ReverseRegistrars`, `testnetL2ReverseRegistrars` and
  `Abis.shared.ownable`.
