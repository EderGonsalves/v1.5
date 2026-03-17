/**
 * Script pontual para corrigir departamentos de casos da instituição 3176.
 *
 * Estratégia: busca nas mensagens (tabela 227) quais casos tiveram contato
 * com o número 11944972091 (from ou to). Esses casos pertencem ao departamento
 * "Dra. Juliana Paiva da Silva" (id=7). Os demais ficam no outro departamento.
 *
 * Uso:
 *   npx tsx scripts/fix-departments-3176.ts          # dry-run (padrão)
 *   npx tsx scripts/fix-departments-3176.ts --apply   # aplica as correções
 */

import * as fs from "fs";
import * as pathMod from "path";
import axios from "axios";

// Load .env manually (no dotenv dependency)
const envPath = pathMod.resolve(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const BASEROW_API_URL =
  process.env.BASEROW_API_URL ||
  process.env.AUTOMATION_DB_API_URL ||
  "https://automation-db.riasistemas.com.br/api";
const BASEROW_API_KEY =
  process.env.BASEROW_API_KEY ||
  process.env.AUTOMATION_DB_TOKEN ||
  "";

if (!BASEROW_API_KEY) {
  console.error("BASEROW_API_KEY não definido no .env");
  process.exit(1);
}

const INSTITUTION_ID = 3176;
const CASES_TABLE_ID =
  Number(process.env.NEXT_PUBLIC_BASEROW_CASES_TABLE_ID || process.env.BASEROW_CASES_TABLE_ID) || 225;
const MESSAGES_TABLE_ID =
  Number(process.env.BASEROW_CASE_MESSAGES_TABLE_ID) || 227;

// Telefone alvo e departamento correto
const TARGET_PHONE = "11944972091";
const TARGET_DEPT = { deptId: 7, deptName: "Dra. Juliana Paiva da Silva" };

const headers = { Authorization: `Token ${BASEROW_API_KEY}` };
const dryRun = !process.argv.includes("--apply");

// ---------------------------------------------------------------------------
// 1. Buscar CaseIds das mensagens que envolvem o telefone alvo
// ---------------------------------------------------------------------------
async function getCaseIdsFromMessages(phone: string): Promise<Set<string>> {
  const caseIds = new Set<string>();

  // Buscar mensagens onde "from" contém o telefone
  for (const field of ["from", "to"]) {
    let url: string | null =
      `${BASEROW_API_URL}/database/rows/table/${MESSAGES_TABLE_ID}/?user_field_names=true&size=200` +
      `&filter__${field}__contains=${phone}&include=CaseId,${field}`;

    while (url) {
      const { data } = await axios.get(url, { headers });
      for (const row of data.results) {
        const caseId = row.CaseId;
        if (caseId) caseIds.add(String(caseId));
      }
      url = data.next;
      if (url) process.stdout.write(`\r  Buscando mensagens (${field})... ${caseIds.size} casos encontrados`);
    }
  }

  console.log(`\r  Total de casos com mensagens envolvendo ${phone}: ${caseIds.size}          `);
  return caseIds;
}

// ---------------------------------------------------------------------------
// 2. Buscar todos os casos da instituição
// ---------------------------------------------------------------------------
interface CaseRow {
  id: number;
  department_id?: number | null;
  department_name?: string | null;
  CustumerPhone?: string | null;
  responsavel?: string | null;
  CaseId?: string | null;
}

async function getAllCases(): Promise<CaseRow[]> {
  const cases: CaseRow[] = [];

  let url: string | null =
    `${BASEROW_API_URL}/database/rows/table/${CASES_TABLE_ID}/?user_field_names=true&size=200` +
    `&filter__InstitutionID__equal=${INSTITUTION_ID}`;

  while (url) {
    const { data } = await axios.get(url, { headers });
    cases.push(...data.results);
    url = data.next;
    process.stdout.write(`\r  Buscando casos... ${cases.length}`);
  }
  console.log(`\r  Total de casos: ${cases.length}          `);

  return cases;
}

// ---------------------------------------------------------------------------
// 3. Atualizar caso no Baserow
// ---------------------------------------------------------------------------
async function updateCase(rowId: number, fields: Record<string, unknown>): Promise<void> {
  const url = `${BASEROW_API_URL}/database/rows/table/${CASES_TABLE_ID}/${rowId}/?user_field_names=true`;
  await axios.patch(url, fields, { headers });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n=== Fix Departamentos — Instituição ${INSTITUTION_ID} ===`);
  console.log(`Modo: ${dryRun ? "DRY-RUN (use --apply para aplicar)" : "APLICANDO CORREÇÕES"}`);
  console.log(`Telefone alvo: ${TARGET_PHONE} → ${TARGET_DEPT.deptName} (id=${TARGET_DEPT.deptId})\n`);

  // 1. Buscar CaseIds nas mensagens
  console.log("Passo 1: Buscando mensagens com o telefone alvo...");
  const julianaCaseIds = await getCaseIdsFromMessages(TARGET_PHONE);

  if (julianaCaseIds.size === 0) {
    console.log("\nNenhuma mensagem encontrada com esse telefone. Abortando.");
    return;
  }

  // 2. Buscar todos os casos
  console.log("\nPasso 2: Buscando todos os casos da instituição...");
  const cases = await getAllCases();

  // 3. Identificar casos que precisam de correção
  console.log("\nPasso 3: Analisando...");

  const toFix: { caseRow: CaseRow; correctDept: { deptId: number; deptName: string } }[] = [];
  let alreadyCorrect = 0;
  let notJuliana = 0;

  for (const c of cases) {
    // Verificar se o CaseId deste caso aparece nas mensagens do telefone alvo
    // CaseId no Baserow pode ser o row id ou um campo específico
    const caseIdStr = String(c.CaseId || c.id);
    const rowIdStr = String(c.id);

    const belongsToJuliana = julianaCaseIds.has(caseIdStr) || julianaCaseIds.has(rowIdStr);

    if (!belongsToJuliana) {
      notJuliana++;
      continue;
    }

    const currentDeptId = Number(c.department_id) || 0;
    if (currentDeptId === TARGET_DEPT.deptId) {
      alreadyCorrect++;
      continue;
    }

    toFix.push({ caseRow: c, correctDept: TARGET_DEPT });
  }

  console.log(`\nResultados:`);
  console.log(`  Casos do outro departamento:          ${notJuliana}`);
  console.log(`  Já no departamento correto (Juliana):  ${alreadyCorrect}`);
  console.log(`  Para transferir para Juliana:          ${toFix.length}\n`);

  if (toFix.length === 0) {
    console.log("Nenhum caso precisa de correção!");
    return;
  }

  // Detalhar mudanças (primeiros 50)
  const showLimit = 50;
  console.log(`Casos a corrigir${toFix.length > showLimit ? ` (mostrando ${showLimit} de ${toFix.length})` : ""}:`);
  for (const { caseRow } of toFix.slice(0, showLimit)) {
    const from = caseRow.department_name || caseRow.department_id || "(nenhum)";
    console.log(
      `  Caso #${caseRow.id} (CaseId: ${caseRow.CaseId || "-"}) | ` +
      `resp: ${caseRow.responsavel || "(sem)"} | ` +
      `${from} → ${TARGET_DEPT.deptName}`,
    );
  }
  if (toFix.length > showLimit) console.log(`  ... e mais ${toFix.length - showLimit} casos`);
  console.log();

  if (dryRun) {
    console.log("=== DRY-RUN concluído. Use --apply para aplicar as correções. ===\n");
    return;
  }

  // 4. Aplicar
  let success = 0;
  let errors = 0;
  for (const { caseRow } of toFix) {
    try {
      await updateCase(caseRow.id, {
        department_id: TARGET_DEPT.deptId,
        department_name: TARGET_DEPT.deptName,
      });
      success++;
      process.stdout.write(`\r  Atualizados: ${success}/${toFix.length}`);
    } catch (err: unknown) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n  ERRO caso #${caseRow.id}: ${msg}`);
    }
  }

  console.log(`\n\n=== Concluído: ${success} transferidos para ${TARGET_DEPT.deptName}, ${errors} erros ===\n`);
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
