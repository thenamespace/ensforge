---
"@ensforge/sdk": minor
"@ensforge/hca": minor
---

- `Ensforge.create`, `chains` and every action accept a viem client as the new `ViemClientLike` type: any `PublicClient`, `WalletClient`, test client or `createClient` client still fits. It leaves out viem's generic `extend` and typed `request`, so app code that creates the viem client inline (`Ensforge.create({ publicClient: createPublicClient(...) })`) type-checks with about 120k fewer type instantiations (−69%). `ens.publicClient` is still the full viem client. HCA actions take the same client type.
