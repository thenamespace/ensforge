import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { Effect } from "effect";

/** What the gateway answers: an HTTP status and a raw body. */
export type GatewayAnswer = { readonly status: number; readonly body: string };

type Running = { readonly server: Server; readonly url: string; readonly requests: () => number };

/**
 * An in-process CCIP-Read gateway on 127.0.0.1 that answers every request with `answer()`, for
 * the enclosing scope. `requests` counts what reached it.
 */
export const gateway = (answer: () => GatewayAnswer) =>
  Effect.acquireRelease(
    Effect.callback<Running>((resume) => {
      let requests = 0;
      // Answers once the request body is read; answering earlier can reset the connection.
      const server = createServer((request, response) => {
        requests += 1;
        request.resume().on("end", () => {
          const { status, body } = answer();
          response.writeHead(status, { "Content-Type": "application/json" }).end(body);
        });
      });
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address() as AddressInfo;
        resume(
          Effect.succeed({ server, url: `http://127.0.0.1:${port}/`, requests: () => requests }),
        );
      });
    }),
    ({ server }) => Effect.sync(() => server.close()),
  );
