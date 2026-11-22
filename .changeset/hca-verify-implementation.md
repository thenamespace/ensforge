---
"@ensforge/hca": patch
---

An existing HCA's implementation is read through `VerifiableFactory.verifyContract`, which checks
the proxy's address and reads its implementation slot, instead of the account's own
`getImplementation`. One the factory cannot verify reports `untrusted-implementation`.
