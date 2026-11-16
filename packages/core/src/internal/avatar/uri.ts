/** HTTP gateways used to load decentralized storage. */
export type Gateways = {
  /** IPFS gateway origin. @default "https://ipfs.io" */
  readonly ipfs?: string | undefined;
  /** Arweave gateway origin. @default "https://arweave.net" */
  readonly arweave?: string | undefined;
};

const defaults = { ipfs: "https://ipfs.io", arweave: "https://arweave.net" } as const;

const trimSlash = (origin: string): string => origin.replace(/\/+$/, "");

// CIDv0 (Qm…, 46 chars) or CIDv1 (base32 bafy…/bafk…) without a scheme.
const bareCid = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,})(\/.*)?$/;

/**
 * Turns an avatar or metadata URI into something a browser can load: `http(s)` and `data:` pass
 * through; `ipfs://`, `ipns://`, `ar://` and bare CIDs go through a gateway. Returns `undefined`
 * for anything else.
 */
export const toHttpUrl = (uri: string, gateways: Gateways = {}): string | undefined => {
  const value = uri.trim();
  const ipfs = trimSlash(gateways.ipfs ?? defaults.ipfs);

  if (/^(https?:|data:)/i.test(value)) return value;

  const ipfsPath = /^ipfs:\/\/(?:ipfs\/)?(.+)$/i.exec(value) ?? /^\/ipfs\/(.+)$/.exec(value);
  if (ipfsPath !== null) return `${ipfs}/ipfs/${ipfsPath[1]}`;

  const ipns = /^ipns:\/\/(?:ipns\/)?(.+)$/i.exec(value) ?? /^\/ipns\/(.+)$/.exec(value);
  if (ipns !== null) return `${ipfs}/ipns/${ipns[1]}`;

  const arweave = /^ar:\/\/(.+)$/i.exec(value);
  if (arweave !== null) return `${trimSlash(gateways.arweave ?? defaults.arweave)}/${arweave[1]}`;

  if (bareCid.test(value)) return `${ipfs}/ipfs/${value}`;
  return undefined;
};
