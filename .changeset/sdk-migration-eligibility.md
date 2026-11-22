---
"@ensforge/sdk": minor
---

- A name late in its grace period, whose ENSv2 reservation has lapsed, can migrate with `renew`: renewing through ETHRenewerV1 revives the reservation. `migration.get` no longer reports `not-reserved` for it, only `expired`.
- New blocker `wrapper-out-of-sync`: a wrapped `.eth` name renewed without the NameWrapper being told, which past its old expiry reports it with no owner or fuses (a locked name looked unlocked and unowned).
- New action `wrapper.sync` (and `wrapper.syncSync`): calls `ETHRenewerV1.syncWrapper` for wrapped `.eth` names, which anyone may call. Run it, then migrate.
