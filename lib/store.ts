import { promises as fs } from "fs";
import path from "path";
import { seed } from "./seed";
import type { DB } from "./types";

/* ------------------------------------------------------------------
   A small JSON-file database.
   - one process owns data/db.json; all writes go through a queue
   - each mutation runs on a copy, so a thrown validation error leaves
     nothing half-applied
   - `version` bumps on every write; the admin panel polls it
   ------------------------------------------------------------------ */

const DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const FILE = path.join(DIR, "db.json");

type Cache = { db: DB | null; mtime: number; queue: Promise<unknown> };
const g = globalThis as typeof globalThis & { __clcStore?: Cache };
const cache: Cache = (g.__clcStore ??= { db: null, mtime: 0, queue: Promise.resolve() });

export class ApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

async function persist(db: DB) {
  await fs.mkdir(DIR, { recursive: true });
  const body = JSON.stringify(db);
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, body, "utf8");
  try {
    await fs.rename(tmp, FILE);
  } catch {
    // Windows can refuse the rename while something (AV, an editor) holds the file
    await fs.writeFile(FILE, body, "utf8");
    await fs.rm(tmp, { force: true });
  }
  cache.mtime = (await fs.stat(FILE)).mtimeMs;
}

async function load(): Promise<DB> {
  let st: { mtimeMs: number } | null = null;
  try {
    st = await fs.stat(FILE);
  } catch {}

  if (cache.db && st && st.mtimeMs === cache.mtime) return cache.db;

  if (!st) {
    const db = seed();
    await persist(db);
    cache.db = db;
    return db;
  }
  const db = JSON.parse(await fs.readFile(FILE, "utf8")) as DB;
  cache.db = db;
  cache.mtime = st.mtimeMs;
  return db;
}

/** Read-only snapshot. Do not mutate the result. */
export async function read(): Promise<DB> {
  await cache.queue;
  return load();
}

/** Serialized, all-or-nothing write. */
export function mutate<T>(fn: (db: DB) => T): Promise<T> {
  const run = cache.queue.then(async () => {
    const draft = structuredClone(await load());
    const out = fn(draft);
    draft.version += 1;
    await persist(draft);
    cache.db = draft;
    return out;
  });
  cache.queue = run.catch(() => {});
  return run;
}
