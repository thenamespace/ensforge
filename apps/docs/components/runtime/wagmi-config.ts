import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";

const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim();

const connectors = connectorsForWallets(
  [
    {
      groupName: "Wallets",
      wallets: [injectedWallet, ...(walletConnectProjectId ? [walletConnectWallet] : [])],
    },
  ],
  {
    appName: "ensforge",
    projectId: walletConnectProjectId ?? "",
  },
);

// Production builds read through Namespace's RPC proxy, which keeps the provider key server side and
// only answers allowed origins (ensforge.com among them). The overrides apply to local dev only, so a
// keyed URL in the build environment can't reach the published bundle.
export const wagmiConfig = createConfig({
  chains: [mainnet, sepolia],
  connectors,
  ssr: true,
  transports: {
    [mainnet.id]: http(
      import.meta.env.PROD
        ? `https://rpc.namespace.ninja/rpc/${mainnet.id}`
        : import.meta.env.VITE_ENSFORGE_MAINNET_RPC_URL?.trim() || undefined,
    ),
    [sepolia.id]: http(
      import.meta.env.PROD
        ? `https://rpc.namespace.ninja/rpc/${sepolia.id}`
        : import.meta.env.VITE_ENSFORGE_SEPOLIA_RPC_URL?.trim() || undefined,
    ),
  },
});
