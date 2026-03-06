const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

// Load .env manually
const envPath = path.join(__dirname, "..", ".env");
const envContent = fs.readFileSync(envPath, "utf8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].trim();
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const { rows } = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'database_table_225' ORDER BY ordinal_position"
  );
  rows.forEach((r) => console.log(r.column_name));
  await pool.end();
}

main().catch((e) => {
  console.error(e.message);
  pool.end();
});
