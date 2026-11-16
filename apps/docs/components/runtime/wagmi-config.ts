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
