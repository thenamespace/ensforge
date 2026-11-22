---
"@ensforge/hca": minor
---

- Session executions through `rhinestone()` now send `hcaSessionNonce` and `hcaSessionConfig` in the session's enable data, which the ENS-patched Rhinestone SDK needs to build the proof the HCA validator checks. Without them every session-signed intent failed. The docs now name the SDK the executor needs: `@rhinestone/sdk@1.22.0` with the ENS app's patch.
- A session for another HCA than the signer's fails with `HCA_SESSION_INVALID` (`another account`) before anything is signed.
- `rhinestone()` signs owner intents with a browser wallet's account through the wallet client (viem `toAccount`); a new `ownerAccount` option sets the owner's signer explicitly.
- `hca.revokeSessions` works on an HCA that is not deployed yet: it deploys the HCA, then revokes, in one owner step, with the warning `HCA_DEPLOYED`. Before, it refused, and a session signed for the address stayed usable once anyone deployed it. It is always the owner's own transaction; `via` is ignored.
- `hca.authorizeSession` fails with `HCA_UNAVAILABLE` on a deployment whose validator expects the `"hca"` session domain, which ensforge cannot sign for.
