/**
 * apply-indices.ts
 * Executa o script create-indices.sql no PostgreSQL via pg Pool.
 *
 * Uso:
 *   npx tsx scripts/apply-indices.ts
 *
 * Nota: CREATE INDEX CONCURRENTLY não pode rodar dentro de transação,
 * então cada comando é executado individualmente.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL não configurado. Defina no .env ou exporte a variável.");
  process.exit(1);
}

async function main() {
  const sqlPath = join(__dirname, "create-indices.sql");
  const sql = readFileSync(sqlPath, "utf-8");

  // Separar comandos SQL (ignorar comentários e linhas vazias)
  const commands = sql
    .split(";")
    .map((cmd) => cmd.trim())
    .filter((cmd) => {
      // Remover blocos que são só comentários
      const lines = cmd.split("\n").filter((l) => !l.trim().startsWith("--") && l.trim() !== "");
      return lines.length > 0;
    })
    .map((cmd) => cmd + ";");

  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 10_000,
  });

  console.log(`🔗 Conectando a ${DATABASE_URL!.replace(/:[^:@]+@/, ":***@")}...`);
  console.log(`📋 ${commands.length} comandos para executar\n`);

  let success = 0;
  let skipped = 0;
  let errors = 0;

  for (const cmd of commands) {
    // Extrair nome do índice ou tipo de comando para logging
    const indexMatch = cmd.match(/CREATE INDEX.*?IF NOT EXISTS\s+(\w+)/i);
    const selectMatch = cmd.match(/^SELECT/i);
    const label = indexMatch
      ? `CREATE INDEX ${indexMatch[1]}`
      : selectMatch
        ? "SELECT (verificação)"
        : cmd.substring(0, 60).replace(/\n/g, " ");

    try {
      const result = await pool.query(cmd);

      if (selectMatch && result.rows.length > 0) {
        console.log(`✅ ${label}`);
        console.table(result.rows);
      } else {
        console.log(`✅ ${label}`);
      }
      success++;
    } catch (err: unknown) {
      const pgErr = err as { code?: string; message?: string };
      // 42P07 = relation already exists (índice já existe sem IF NOT EXISTS)
      if (pgErr.code === "42P07") {
        console.log(`⏭️  ${label} — já existe, pulando`);
        skipped++;
      } else {
        console.error(`❌ ${label}`);
        console.error(`   ${pgErr.message}`);
        errors++;
      }
    }
  }

  console.log(`\n📊 Resumo: ${success} ok, ${skipped} pulados, ${errors} erros`);

  await pool.end();
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
