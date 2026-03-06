/**
 * Script de diagnóstico: verifica as últimas mensagens no banco
 *
 * Rodar no servidor (dentro do container ou onde tem acesso ao PostgreSQL):
 *   node scripts/debug-messages.js
 *   node scripts/debug-messages.js 4130    (filtra por caso específico)
 */

const { Client } = require("pg");

const DB_URL = process.env.DATABASE_URL || "postgresql://postgres:RLaNTHerwalc@postgres:5432/baserow";
const CASE_FILTER = process.argv[2]; // opcional: filtrar por caso

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  console.log("\n=== ÚLTIMAS 20 MENSAGENS NO BANCO ===\n");

  const query = CASE_FILTER
    ? `SELECT id, field_1701 as "CaseId", field_1702::text as "Sender",
             field_1706 as "from", field_1707 as "to",
             LEFT(field_1704::text, 80) as "Message",
             created_on
       FROM database_table_227
       WHERE field_1701 = $1
       ORDER BY id DESC LIMIT 20`
    : `SELECT id, field_1701 as "CaseId", field_1702::text as "Sender",
             field_1706 as "from", field_1707 as "to",
             LEFT(field_1704::text, 80) as "Message",
             created_on
       FROM database_table_227
       ORDER BY id DESC LIMIT 20`;

  const params = CASE_FILTER ? [CASE_FILTER] : [];
  const res = await client.query(query, params);

  for (const row of res.rows) {
    const sender = row.Sender || "null";
    const from = row.from || "-";
    const to = row.to || "-";
    const msg = (row.Message || "").replace(/\n/g, " ").substring(0, 60);
    console.log(
      `id=${row.id} | CaseId="${row.CaseId}" | Sender=${sender} | from=${from} | to=${to} | ${row.created_on}`
    );
    console.log(`  → "${msg}"`);
    console.log();
  }

  // Verificar se há mensagens recentes com CaseId vazio/null
  const nullCheck = await client.query(`
    SELECT COUNT(*) as total,
           COUNT(CASE WHEN field_1701 IS NULL OR field_1701 = '' THEN 1 END) as sem_caseid
    FROM database_table_227
    WHERE id > (SELECT MAX(id) - 50 FROM database_table_227)
  `);

  const { total, sem_caseid } = nullCheck.rows[0];
  console.log(`\n=== RESUMO (últimas 50 msgs) ===`);
  console.log(`Total: ${total} | Sem CaseId: ${sem_caseid}`);

  if (parseInt(sem_caseid) > 0) {
    console.log("\n⚠️  PROBLEMA ENCONTRADO: Existem mensagens SEM CaseId!");
    console.log("   O polling incremental filtra por CaseId — essas mensagens nunca serão encontradas.");

    const nullMsgs = await client.query(`
      SELECT id, field_1706 as "from", field_1707 as "to",
             LEFT(field_1704::text, 60) as "Message", created_on
      FROM database_table_227
      WHERE (field_1701 IS NULL OR field_1701 = '')
        AND id > (SELECT MAX(id) - 50 FROM database_table_227)
      ORDER BY id DESC LIMIT 10
    `);
    console.log("\n   Mensagens sem CaseId:");
    for (const row of nullMsgs.rows) {
      console.log(`   id=${row.id} from=${row.from} to=${row.to} → "${row.Message}"`);
    }
  }

  await client.end();
}

main().catch((e) => {
  console.error("Erro:", e.message);
  process.exit(1);
});
