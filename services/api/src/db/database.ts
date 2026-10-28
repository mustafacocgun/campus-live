import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

/** services/api/migrations (same depth from src/ and dist/). */
const MIGRATIONS_DIR = fileURLToPath(new URL("../../migrations/", import.meta.url));

export type Db = pg.Pool;

/** A pool that gives up quickly: a database that is down must not hang a request or the startup. */
export function createDb(url: string): Db {
  return new pg.Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 3_000 });
}

/**
 * Applies every migrations/*.sql file not applied yet, in file-name order, each in its own
 * transaction. Returns the names it applied.
 */
export async function migrate(db: Db): Promise<string[]> {
  await db.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const done = new Set(
    (await db.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((row) => row.name),
  );
  const applied: string[] = [];
  for (const name of readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    if (done.has(name)) continue;
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(readFileSync(`${MIGRATIONS_DIR}${name}`, "utf8"));
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
      applied.push(name);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return applied;
}

/** Postgres and socket error codes that mean "the database is unreachable", not "the query is wrong". */
const UNREACHABLE = new Set(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "57P01", "57P03", "08001", "08006"]);

export function isDbUnreachable(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message : "";
  return (
    (typeof code === "string" && UNREACHABLE.has(code)) ||
    message.includes("timeout exceeded when trying to connect")
  );
}
