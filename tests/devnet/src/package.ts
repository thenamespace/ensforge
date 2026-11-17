import { fileURLToPath } from "node:url";

/** The `tests/devnet` folder. */
export const packageDir = fileURLToPath(new URL("..", import.meta.url));

/** Committed artifacts, one JSON file per contract. */
export const artifactsDir = `${packageDir}artifacts`;

/** Our own Solidity mocks. */
export const contractsDir = `${packageDir}contracts`;

/** Not committed: pinned repository clones and profile state dumps. */
export const cacheDir = `${packageDir}.cache`;
