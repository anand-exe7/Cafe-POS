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

/* Bump whenever migrate() gains a step. The cache is parked on globalThis so it
   survives a dev hot-reload, which means a db parsed by the previous build can
   outlive the code that knew its shape; stamping it makes that copy fall out of
   the cache and be re-read instead of handing back a record missing its new
   fields. */
const SHAPE = 2;

type Cache = { db: DB | null; mtime: number; shape: number; queue: Promise<unknown>; readOnly: boolean };
const g = globalThis as typeof globalThis & { __clcStore?: Cache };
const cache: Cache = (g.__clcStore ??= { db: null, mtime: 0, shape: SHAPE, queue: Promise.resolve(), readOnly: false });

/* A serverless host (Vercel, etc.) ships the code on a read-only filesystem, so
   persist() can't write db.json there. Rather than crash, we keep the whole DB
   in the in-memory cache for the life of the instance — enough to run the app
   as a live demo. Swapping in a real database means replacing load()/persist()
   below; nothing else in the app touches storage. */

export class ApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

async function persist(db: DB) {
  if (cache.readOnly) return; // known read-only host: the cache is the database
  const body = JSON.stringify(db);
  try {
    await fs.mkdir(DIR, { recursive: true });
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
  } catch (e) {
    // Any failure to write the file (a read-only serverless disk is the usual
    // one, but permissions or a missing writable path count too) drops us to an
    // in-memory database for the life of the instance instead of crashing every
    // page. Logged so a genuine disk problem on a writable host stays visible.
    const code = (e as NodeJS.ErrnoException)?.code ?? "unknown";
    if (!cache.readOnly) console.warn(`[store] cannot persist db.json (${code}); running from memory only.`);
    cache.readOnly = true;
  }
}

async function load(): Promise<DB> {
  let st: { mtimeMs: number } | null = null;
  try {
    st = await fs.stat(FILE);
  } catch {}

  /* The warm in-memory copy is authoritative when the file is unchanged, or when
     there's no file to reconcile against on a read-only host — otherwise every
     request there would re-seed and throw away live edits. */
  if (cache.db && cache.shape === SHAPE && (st ? st.mtimeMs === cache.mtime : cache.readOnly)) return cache.db;

  if (!st) {
    const db = seed();
    await persist(db);
    cache.db = db;
    cache.shape = SHAPE;
    return db;
  }
  const db = JSON.parse(await fs.readFile(FILE, "utf8")) as DB;
  migrate(db);
  cache.db = db;
  cache.shape = SHAPE;
  cache.mtime = st.mtimeMs;
  return db;
}

/* Fills in fields added after a file was written, so an older data/db.json keeps
   working. Runs on read only — the next write persists whatever it filled in. */
function migrate(db: DB) {
  /* `source` arrived with the split between the live queue (guest orders) and
     the counter's own. Anything filed before it is read as a guest order, which
     is where all but a handful came from. */
  for (const o of db.orders) o.source ??= "customer";

  /* `users` arrived with the Users page. Before it, the only way in was the one
     shop password, which still works — an empty list just means nobody has been
     given a login of their own yet. */
  db.users ??= [];
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
    cache.shape = SHAPE;
    return out;
  });
  cache.queue = run.catch(() => {});
  return run;
}
