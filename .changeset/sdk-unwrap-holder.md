---
"@ensforge/sdk": minor
---

- `wrapper.unwrap` leaves the name with its current holder by default, not the signer, so an approved operator unwrapping a name no longer takes it. Pass `owner` to send it elsewhere.
