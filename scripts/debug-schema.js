/**
 * Descobre as colunas atuais da tabela de mensagens (database_table_227)
 * Rodar no servidor: node scripts/debug-schema.js
 */
const { Client } = require("pg");
const DB_URL = process.env.DATABASE_URL || "postgresql://postgres:RLaNTHerwalc@postgres:5432/baserow";

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  const res = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'database_table_227'
    ORDER BY ordinal_position
  `);

  console.log("\n=== COLUNAS DE database_table_227 ===\n");
  for (const row of res.rows) {
    console.log(`  ${row.column_name.padEnd(25)} ${row.data_type}`);
  }

  // Verificar se field_1702 existe
  const has1702 = res.rows.some(r => r.column_name === "field_1702");
  console.log(`\nfield_1702 existe? ${has1702 ? "SIM" : "NÃO ← PROBLEMA!"}`);

  // Mostrar campos JSONB (possíveis candidates para Sender)
  const jsonbCols = res.rows.filter(r => r.data_type === "jsonb");
  if (jsonbCols.length) {
    console.log("\nCampos JSONB (possíveis Sender):");
    for (const col of jsonbCols) {
      const sample = await client.query(`
        SELECT "${col.column_name}"::text FROM database_table_227
        WHERE "${col.column_name}" IS NOT NULL LIMIT 1
      `);
      const val = sample.rows[0]?.[col.column_name] || "null";
      console.log(`  ${col.column_name} → ${val}`);
    }
  }

  await client.end();
}

main().catch(e => { console.error("Erro:", e.message); process.exit(1); });
