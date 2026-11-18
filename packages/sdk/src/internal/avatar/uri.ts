import type { Config } from "../../client/types.js";

// CIDv0 (Qm…, 46 chars) or CIDv1 (base32 bafy…/bafk…) without a scheme.
const bareCid = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,})(\/.*)?$/;

/**
 * Turns an avatar or metadata URI into something a browser can load: `http(s)` and `data:` pass
 * through; `ipfs://`, `ipns://`, `ar://` and bare CIDs go through a gateway. Returns `undefined`
 * for anything else.
 */
export const toHttpUrl = (uri: string, gateways: Config["gateways"]): string | undefined => {
  const value = uri.trim();
  const { ipfs, arweave: arweaveGateway } = gateways;

  if (/^(https?:|data:)/i.test(value)) return value;

  const ipfsPath = /^ipfs:\/\/(?:ipfs\/)?(.+)$/i.exec(value) ?? /^\/ipfs\/(.+)$/.exec(value);
  if (ipfsPath !== null) return `${ipfs}/ipfs/${ipfsPath[1]}`;

  const ipns = /^ipns:\/\/(?:ipns\/)?(.+)$/i.exec(value) ?? /^\/ipns\/(.+)$/.exec(value);
  if (ipns !== null) return `${ipfs}/ipns/${ipns[1]}`;

  const arweave = /^ar:\/\/(.+)$/i.exec(value);
  if (arweave !== null) return `${arweaveGateway}/${arweave[1]}`;

  if (bareCid.test(value)) return `${ipfs}/ipfs/${value}`;
  return undefined;
};
