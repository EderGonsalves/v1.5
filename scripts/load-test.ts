/**
 * Teste de carga das API routes usando autocannon.
 *
 * Uso:
 *   1. Inicie o app: npm run dev
 *   2. Copie o cookie onboarding_auth do browser (DevTools → Application → Cookies)
 *   3. Execute: npx tsx scripts/load-test.ts [--cookie "onboarding_auth=..."]
 *
 * Opções:
 *   --cookie     Cookie de autenticação (obrigatório)
 *   --base-url   URL base (default: http://localhost:3000)
 *   --connections Conexões simultâneas (default: 10)
 *   --duration   Duração em segundos por teste (default: 10)
 *   --only       Rodar apenas um teste pelo índice (0, 1, 2, ...)
 */

import autocannon from "autocannon";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getArg(name: string, defaultValue: string): string {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return defaultValue;
}

const AUTH_COOKIE = getArg("cookie", "");
const BASE_URL = getArg("base-url", "http://localhost:3000");
const CONNECTIONS = Number(getArg("connections", "10"));
const DURATION = Number(getArg("duration", "10"));
const ONLY = getArg("only", "");

if (!AUTH_COOKIE) {
  console.error(
    "Erro: cookie de autenticação obrigatório.\n\n" +
    "Uso: npx tsx scripts/load-test.ts --cookie \"onboarding_auth=%7B%22institutionId%22...}\"\n\n" +
    "Copie o valor do cookie onboarding_auth do DevTools do browser."
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Test definitions
// ---------------------------------------------------------------------------

type TestDef = {
  name: string;
  url: string;
  method: "GET" | "POST" | "PATCH";
  body?: string;
  description: string;
};

const tests: TestDef[] = [
  {
    name: "GET queue-mode",
    url: `${BASE_URL}/api/v1/config/queue-mode`,
    method: "GET",
    description: "Leitura do modo de distribuição (cache-friendly, deve ser <50ms)",
  },
  {
    name: "POST auto-assign",
    url: `${BASE_URL}/api/v1/cases/auto-assign`,
    method: "POST",
    description: "Ciclo completo de auto-assign (throttled 30s, segunda chamada retorna rápido)",
  },
  {
    name: "GET calendar events (30 dias)",
    url: `${BASE_URL}/api/v1/calendar/events?start=2026-03-01&end=2026-03-31`,
    method: "GET",
    description: "Listagem de eventos do calendário — mede impacto do Baserow/Drizzle",
  },
  {
    name: "GET calendar availability",
    url: `${BASE_URL}/api/v1/calendar/availability?institutionId=1&days=7`,
    method: "GET",
    description: "Cálculo de slots disponíveis (CPU-bound: slot scanning)",
  },
  {
    name: "GET users list",
    url: `${BASE_URL}/api/v1/users`,
    method: "GET",
    description: "Listagem de usuários da instituição",
  },
  // ----- Casos -----
  {
    name: "GET cases list",
    url: `${BASE_URL}/api/v1/cases`,
    method: "GET",
    description: "Listagem de casos da instituição (light fields, cache 30s)",
  },
  {
    name: "GET conversations list",
    url: `${BASE_URL}/api/conversations`,
    method: "GET",
    description: "Listagem de conversas (sidebar do chat, cache 2min)",
  },
  // ----- Chat -----
  {
    name: "GET chat messages (case 1)",
    url: `${BASE_URL}/api/cases/1/messages`,
    method: "GET",
    description: "Full-load de mensagens de um caso (mede Drizzle + cache 30s)",
  },
  {
    name: "GET chat incremental (case 1)",
    url: `${BASE_URL}/api/cases/1/messages?since_id=0`,
    method: "GET",
    description: "Polling incremental (since_id=0 → full, simula polling ativo)",
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function printBar(label: string, value: number, max: number, width = 30): void {
  const filled = Math.round((value / max) * width) || 1;
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  console.log(`  ${label.padEnd(12)} ${bar} ${formatMs(value)}`);
}

async function runTest(test: TestDef): Promise<void> {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${test.name}`);
  console.log(`  ${test.description}`);
  console.log(`  ${test.method} ${test.url}`);
  console.log(`  ${CONNECTIONS} conexões × ${DURATION}s`);
  console.log(`${"─".repeat(60)}`);

  const opts: autocannon.Options = {
    url: test.url,
    method: test.method,
    headers: {
      Cookie: AUTH_COOKIE,
      "Content-Type": "application/json",
    },
    connections: CONNECTIONS,
    duration: DURATION,
    pipelining: 1,
  };

  if (test.body) {
    opts.body = test.body;
  }

  const result = await autocannon(opts);

  const lat = result.latency;
  const req = result.requests;
  const maxLat = Math.max(lat.p99, lat.max, 1);

  console.log("\n  Latência:");
  printBar("avg", lat.average, maxLat);
  printBar("p50", lat.p50, maxLat);
  printBar("p90", lat.p90, maxLat);
  printBar("p99", lat.p99, maxLat);
  printBar("max", lat.max, maxLat);

  console.log("\n  Throughput:");
  console.log(`  Requests/sec:  ${req.average.toFixed(1)}`);
  console.log(`  Total:         ${req.total}`);

  // Status code breakdown
  const statuses = result.statusCodeStats || {};
  const statusEntries = Object.entries(statuses);
  if (statusEntries.length > 0) {
    console.log("\n  Status codes:");
    for (const [code, stats] of statusEntries) {
      console.log(`    ${code}: ${(stats as { count: number }).count}`);
    }
  }

  if (result.errors > 0) {
    console.log(`\n  ⚠ Erros de conexão: ${result.errors}`);
  }
  if (result.timeouts > 0) {
    console.log(`  ⚠ Timeouts: ${result.timeouts}`);
  }

  // Performance assessment
  console.log("\n  Avaliação:");
  if (lat.p99 < 100) {
    console.log("  ✓ P99 < 100ms — Excelente");
  } else if (lat.p99 < 500) {
    console.log("  ~ P99 < 500ms — Aceitável");
  } else if (lat.p99 < 2000) {
    console.log("  ⚠ P99 < 2s — Lento, investigar");
  } else {
    console.log("  ✗ P99 > 2s — Crítico, otimização necessária");
  }
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║           TESTE DE CARGA — Onboarding App              ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`  Base URL:    ${BASE_URL}`);
  console.log(`  Conexões:    ${CONNECTIONS}`);
  console.log(`  Duração:     ${DURATION}s por teste`);
  console.log(`  Testes:      ${ONLY ? `apenas #${ONLY}` : `todos (${tests.length})`}`);

  const toRun = ONLY !== ""
    ? [tests[Number(ONLY)]].filter(Boolean)
    : tests;

  if (toRun.length === 0) {
    console.error("Nenhum teste encontrado.");
    process.exit(1);
  }

  const startTime = Date.now();

  for (const test of toRun) {
    await runTest(test);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  Concluído em ${elapsed}s`);
  console.log(`${"═".repeat(60)}\n`);
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
