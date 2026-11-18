import { absolute, site } from "@/lib/site";

/**
 * The landing pages as Markdown for agents, served at `/index.md` and through content
 * negotiation. Keep them in step with the pages themselves.
 */

export type LandingPage = "index";

const directive = `> For the complete documentation index, see [llms.txt](${absolute("/llms.txt")}).`;

const pages: Record<LandingPage, () => string> = {
  index: () => `# ${site.name}

${directive}

${site.description}

## Install

\`\`\`sh
pnpm add @ensforge/sdk viem effect
\`\`\`

\`\`\`ts
import { Ensforge, ensActions } from "@ensforge/sdk";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const ens = Ensforge.create({
  publicClient: createPublicClient({ chain: mainnet, transport: http() }),
}).extend(ensActions());

const address = await ens.record.getAddress({ name: "nick.eth" });
\`\`\`

Quick start: ${absolute("/docs/sdk.md")}. API reference: ${absolute("/docs/reference.md")}.

## Packages

- \`@ensforge/sdk\`: the client. Every ENS read and write, for every name, on viem: reads, writes and registration, typed errors with stable codes, batches and multi-step plans. Docs: ${absolute("/docs/sdk.md")}
- \`@ensforge/react\`: hooks for React 19 (\`useAddress\`, \`usePrimaryName\`, \`useWrite\`, …), with Suspense and server rendering. Docs: ${absolute("/docs/react.md")}
- \`@ensforge/hca\` (experimental): Hosted Contract Accounts: many writes in one execution, sessions, bundlers and paymasters. Docs: ${absolute("/docs/hca.md")}
- \`@ensforge/contracts\`: ENS ABIs, deployment addresses and constants for viem. Docs: ${absolute("/docs/contracts.md")}

## How it fits

1. Your app calls ensforge with Promises, an Effect program or React hooks.
2. One client, created from your viem client; add a wallet only to write.
3. Actions normalize names, find the right contract and decode answers; reads batch, writes become plans.
4. ENSv1 and ENSv2, wrapped or not, on-chain or off-chain through CCIP-Read: every name answers the same way.

Source: ${site.github}
`,
};

export const landingPaths: Record<string, LandingPage> = {
  "/": "index",
};

export const isLandingPage = (page: string): page is LandingPage => Object.hasOwn(pages, page);

export const landingMarkdown = (page: LandingPage) => pages[page]();
