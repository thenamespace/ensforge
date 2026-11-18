/**
 * Fixtures bigname reads differently from the chain, by design or as a known bigname behaviour:
 * `fixture: what differs` → why. Checked exactly, so the list only shrinks.
 */
export const indexedDifferences: Readonly<Record<string, string>> = {
  "resolver.registry-reverts: chain error CONTRACT_REVERTED":
    "The name's ENSv2 registry reverts; ensforge fails `name.get`, bigname reports what it indexed.",
  "v1.unwrapped.grace: owner 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc, chain null":
    "A registrar token has no holder once it expires; bigname keeps the registrant through grace.",
  "v1.unwrapped.registrar-only: expiry 1930264804, chain 1924908003":
    "A registrant without a registry owner: bigname serves only the ENSv2 reservation (no ENSv1 facts).",
  "v1.unwrapped.registrar-only: owner null, chain 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc":
    "Same name: bigname reports no owner for the reservation; ensforge reports the registrant.",
  "v1.wrapped.sub.expired: status active, chain expired":
    "A wrapped subname past its NameWrapper expiry: bigname still reports it active.",
  "v2.grace: status released, chain grace":
    "bigname gives ENSv2 names no grace period (grace ends at expiry); ETHRegistrar renews through GRACE_PERIOD.",
  "v2.unregistered.renewed: expiry 18446744073709551615, chain 1924916945":
    "An unregistered ENSv2 label renewed as an ENSv1 reservation: bigname reports no expiry.",
  "v2.unregistered.renewed: status released, chain reserved":
    "Same label: bigname calls the reservation released; ensforge reports it reserved.",
};

/** Records bigname serves differently from the resolver: `fixture: record` → why. */
export const indexedRecordDifferences: Readonly<Record<string, string>> = {};
