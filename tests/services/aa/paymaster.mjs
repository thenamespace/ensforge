import { paymaster } from "@pimlico/mock-paymaster";

// The mock paymaster signs `validUntil` from `Date.now()`, but the devnet's clock runs ahead of
// real time (profiles jump it), so its signatures would be expired on-chain (AA32). Its clock
// follows the devnet's latest block instead.
const realNow = Date.now.bind(Date);
let offset = 0;
const syncClock = async () => {
  const response = await fetch(process.env.ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getBlockByNumber",
      params: ["latest", false],
    }),
  });
  const { result } = await response.json();
  offset = Number(BigInt(result.timestamp)) * 1000 - realNow();
};
await syncClock();
setInterval(
  () => syncClock().catch((error) => process.stderr.write(`clock sync failed: ${error}\n`)),
  1000,
);
Date.now = () => realNow() + offset;

const server = paymaster({
  host: "0.0.0.0",
  port: Number(process.env.PORT ?? 3000),
  anvilRpc: process.env.ANVIL_RPC,
  altoRpc: process.env.ALTO_RPC,
});
await server.start();
process.stdout.write("paymaster listening\n");
