/**
 * The gas limit a call needs: its estimate and a fifth more. Wallets often send exactly their
 * estimate, some costs change by the second (an ENSv2 premium decays), and a simulation reports
 * the gas a call used rather than the limit it needs, so a call sent at its estimate can run out
 * of gas.
 */
export const withHeadroom = (estimate: bigint) => (estimate * 6n) / 5n;
