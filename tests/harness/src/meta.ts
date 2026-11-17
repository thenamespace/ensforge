/** Catalog case IDs (`tests/fixtures/catalog`) a test covers, tagged as `meta: { cases }`. */
export type Cases = readonly string[];

declare module "vitest" {
  interface TaskMeta {
    readonly cases?: Cases;
  }
}
