---
"@ensforge/sdk": minor
---

Renewals that cannot leave a name expired or pay twice, and smaller registration fixes.

- `registration.renew` refuses a renewal of a name in its grace period that would leave it
  expired (or expiring within a day) with `DURATION_TOO_SHORT`, naming the shortest duration
  that works. Before, the renewal was paid and the name stayed expired.
- New `until` option on `renew` and `getRenewalPrice`, instead of `duration`: every name is
  extended to one expiry. Names already reaching it are skipped (warning, or
  `NAME_ALREADY_RENEWED` when nothing is left), so a retry never pays twice; an `until` in the
  past fails with `INVALID_EXPIRY`. `getRenewalPrice` items carry `expiry` and `duration`.
- Each `renewBatch` call is its own plan step (`renew:v2:0`, `renew:v1:0`, …; `renew` when there
  is one), so a resumed renewal skips the calls already mined.
- An allowance covering the exact price is no longer approved again; a new registration approval
  still adds 2% headroom.
- Registration and renewal warn with `NAME_NORMALIZED` when a name was typed in another form.
- The referrer takes up to 32 bytes of hex, left-padded.
- `getPrice` quotes the registrar's own `getRegisterPrice` for an available name, and a past block
  with that block's price oracle.
