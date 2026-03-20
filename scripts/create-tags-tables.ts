/**
 * Creates the tags tables (258, 259) directly in PostgreSQL.
 *
 * Usage:
 *   npx tsx scripts/create-tags-tables.ts
 *
 * Requires DATABASE_URL in .env
 */

import * as fs from "fs";
import * as path from "path";
import pg from "pg";

// Load .env manually (no dotenv dependency)
const envPath = path.resolve(__dirname, "../.env");
const envContent = fs.readFileSync(envPath, "utf-8");
const envVars: Record<string, string> = {};
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  envVars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
}

const DATABASE_URL = envVars.DATABASE_URL || process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not found in .env");
  process.exit(1);
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    console.log("Connecting to database...");
    await pool.query("SELECT 1");
    console.log("Connected.");

    const sqlPath = path.resolve(__dirname, "create-tags-tables.sql");
    const sql = fs.readFileSync(sqlPath, "utf-8");

    console.log("Creating tables...");
    await pool.query(sql);
    console.log("Tables created successfully.");

    // Verify
    const result = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name IN ('database_table_258', 'database_table_259') ORDER BY table_name",
    );
    console.log(
      "Verified tables:",
      result.rows.map((r: { table_name: string }) => r.table_name),
    );
  } catch (err) {
    console.error("Error:", (err as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
