import type { Plan } from "./Plan.js";
import { deserializeRecord, serialize } from "./serialize.js";

/**
 * In-memory plan storage. Progress is lost when the process or page reloads.
 *
 * @category plans
 * @since 1.0.0
 */
export const memoryStorage = (): Plan.Storage => {
  const records = new Map<string, Plan.Record>();

  return {
    get: async (id) => records.get(id),
    set: async (record) => {
      records.set(record.plan.id, record);
    },
    delete: async (id) => {
      records.delete(id);
    },
    list: async () => [...records.values()],
  };
};

type WebStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const store = (): WebStorage => {
  const storage = (globalThis as { readonly localStorage?: WebStorage }).localStorage;
  if (storage === undefined) throw new Error("localStorage is not available in this environment");
  return storage;
};

/**
 * Browser `localStorage` plan storage, so registrations and migrations survive page reloads.
 *
 * **Details**
 *
 * Every record is kept under one key (default `ensforge:plans`) as JSON. Where `localStorage`
 * does not exist (server rendering), calls reject.
 *
 * @category plans
 * @since 1.0.0
 */
export const localStorage = (key = "ensforge:plans"): Plan.Storage => {
  const read = (): Record<string, string> =>
    JSON.parse(store().getItem(key) ?? "{}") as Record<string, string>;
  const write = (records: Record<string, string>) => store().setItem(key, JSON.stringify(records));

  return {
    get: async (id) => {
      const text = read()[id];
      return text === undefined ? undefined : deserializeRecord(text);
    },
    set: async (record) => {
      write({ ...read(), [record.plan.id]: serialize(record) });
    },
    delete: async (id) => {
      const { [id]: _removed, ...rest } = read();
      write(rest);
    },
    list: async () => Object.values(read()).map(deserializeRecord),
  };
};
