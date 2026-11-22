---
"@ensforge/sdk": minor
---

- `role.grant` and `role.revoke` read role names from the table of the contract they target. Registry and resolver roles share bit positions, so before, `roles: ["setAddr"]` with `target: "registry"` granted the registry's `registrar` role. Such names now fail with `INVALID_ROLES`, and the option types accept only `Role.RegistryName` for registries and `Role.ResolverName` for resolvers (`subname.create` `roles`, `registry.deploy` and `resolver.create` `grants` likewise). Code that passes a `Role.Name[]` variable must narrow it.
- An explicit `contract`, or a name's resolver, must report the kind of contract `target` names (ERC-165); otherwise the plan fails with `INVALID_ADDRESS` before anything is sent.
- New `Role.RegistryName`, `Role.ResolverName` and `Role.NameOf<target>` types; `Role.from` and `Role.has` take an optional `target` that limits names to that table.
