import { paymaster } from "@pimlico/mock-paymaster";

const server = paymaster({
  host: "0.0.0.0",
  port: Number(process.env.PORT ?? 3000),
  anvilRpc: process.env.ANVIL_RPC,
  altoRpc: process.env.ALTO_RPC,
});
await server.start();
process.stdout.write("paymaster listening\n");
