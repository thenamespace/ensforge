---
"@ensforge/sdk": minor
---

Primary names on Ethereum now follow how ENS resolves them: an `addr.reverse` entry with a resolver outranks the `default.reverse` name, even when its name is empty.

- Clearing the Ethereum name (`name: null`, `coin: "eth"`) removes the `addr.reverse` entry's resolver instead of writing an empty name, so the default name applies on Ethereum again. Before, the address showed no name there.
- Setting `coin: "default"` clears an `addr.reverse` entry that holds another name, instead of writing the same name there. An entry with the same name is kept.
- Clearing `coin: "default"` leaves the `addr.reverse` name alone.
- New `coin: "all"`: sets the default name, and with `name: null` clears both.
- `primaryName.set` honours `via`. Through the signer's HCA it uses the reverse registrar adapters' HCA entry points (`setNameWithHCA`, `claimWithHCA`), so the owner's name changes, not the HCA's. An `"eth"` name has no HCA entry point, and a route that is not the signer's HCA cannot name the signer: those calls go to the signer, with the warning `PRIMARY_NAME_ROUTED_TO_SIGNER`. L2 primary names through such a route fail with `UNSUPPORTED_ON_DEPLOYMENT`.
- The adapters' `HCADeploymentNotTrusted` and `HCAOwnerMismatch` reverts map to `UnauthorizedError` (`NOT_APPROVED`).
