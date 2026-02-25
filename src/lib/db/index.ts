/**
 * Drizzle ORM connection pool — lazy initialized.
 *
 * CHALLENGE: api.ts imports db and is also used by "use client" components.
 * Turbopack bundles it for both server and client. On the client, pg (which
 * needs dns/net/tls/fs) cannot be resolved. On the server, Turbopack's
 * requireStub rejects dynamic require calls.
 *
 * SOLUTION:
 * 1. Use `require("node:module").createRequire(...)` to get Node.js NATIVE
 *    require — this bypasses Turbopack's requireStub entirely.
 * 2. Load pg/drizzle via the native require — works for any module.
 * 3. On the client, NOOP_CHAIN handles all db access safely.
 *
 * `node:module` is a Node.js built-in that Turbopack handles natively
 * (doesn't try to bundle it from node_modules like bare `dns` or `fs`).
 */
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

// No-op proxy for client-side safety. Returns itself on any access or call.
// eslint-disable-next-line @typescript-eslint/no-empty-function
const NOOP_CHAIN: unknown = new Proxy(function () {}, {
  get: () => NOOP_CHAIN,
  apply: () => NOOP_CHAIN,
});

const _isServer = typeof window === "undefined";

// Get a NATIVE Node.js require (not Turbopack's stub) via createRequire.
// This allows loading pg and drizzle-orm/node-postgres at runtime.
let _nativeRequire: ((id: string) => unknown) | null = null;
if (_isServer) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeModule = require("node:module") as {
      createRequire: (filename: string) => (id: string) => unknown;
    };
    _nativeRequire = nodeModule.createRequire(
      process.cwd() + "/node_modules/",
    );
  } catch {
    _nativeRequire = null;
  }
}

let _pool: unknown = null;
let _db: NodePgDatabase | null = null;

function getPool() {
  if (!_pool) {
    const connStr = process.env.DATABASE_URL;
    if (!connStr || !_nativeRequire) {
      // DATABASE_URL not available (e.g. during Docker build) — return null
      // so callers fall through to Baserow API via tryDrizzle/circuit breaker.
      return null;
    }
    const pg = _nativeRequire("pg") as { Pool: new (opts: unknown) => unknown };
    _pool = new pg.Pool({
      connectionString: connStr,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return _pool;
}

/** Drizzle ORM instance — lazy initialized on first use. Returns null if DB unavailable. */
export function getDb(): NodePgDatabase | null {
  if (!_db) {
    const pool = getPool();
    if (!pool || !_nativeRequire) return null;
    const mod = _nativeRequire("drizzle-orm/node-postgres") as {
      drizzle: (pool: unknown) => NodePgDatabase;
    };
    _db = mod.drizzle(pool);
  }
  return _db;
}

/** Shortcut — use in services: `import { db } from "@/lib/db"` */
export const db = new Proxy({} as NodePgDatabase, {
  get(_target, prop) {
    if (!_isServer) return NOOP_CHAIN;
    const instance = getDb();
    if (!instance) return NOOP_CHAIN;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (instance as any)[prop];
  },
});

export { getPool };
