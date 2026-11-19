import { createFileRoute } from "@tanstack/react-router";

import { textHeaders } from "@/lib/agent-headers";
import { countAgentRead } from "@/lib/analytics/agent";
import { docsLlms } from "@/lib/source";

/** Every docs page as Markdown, in one file. */
export const Route = createFileRoute("/llms-full.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await countAgentRead(request, "llms_full");

        return new Response(await docsLlms.full(), { headers: textHeaders });
      },
    },
  },
});
