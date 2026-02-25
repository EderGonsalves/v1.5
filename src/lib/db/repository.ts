/**
 * Feature flags para migração incremental Baserow → PostgreSQL direto.
 *
 * Controle via env var DIRECT_DB_TABLES (comma-separated):
 *   DIRECT_DB_TABLES=push,support,lawsuit,sign,docs
 *
 * Ou USE_DIRECT_DB=true para ativar tudo de uma vez.
 *
 * Circuit breaker: na primeira falha de conexão DB, desabilita
 * automaticamente TODOS os branches Drizzle e volta ao Baserow API.
 * Reset automático após 60s para re-tentar.
 */

const USE_DIRECT_DB = process.env.USE_DIRECT_DB === "true";

const DIRECT_TABLES = new Set(
  (process.env.DIRECT_DB_TABLES || "").split(",").map((s) => s.trim()).filter(Boolean),
);

let _dbDisabledUntil = 0;
const CIRCUIT_BREAKER_MS = 60_000; // retry após 60s

/**
 * Verifica se uma tabela/domínio deve usar acesso direto ao PostgreSQL.
 *
 * @param domain - Nome do domínio (ex: "push", "support", "cases", "users")
 * @returns true se deve usar Drizzle, false para usar Baserow API
 */
export function useDirectDb(domain: string): boolean {
  if (typeof window !== "undefined") return false;
  if (_dbDisabledUntil > Date.now()) return false;
  if (USE_DIRECT_DB) return true;
  return DIRECT_TABLES.has(domain);
}

/**
 * Desabilita temporariamente o acesso direto ao DB (circuit breaker).
 * Chamado automaticamente por tryDrizzle() quando uma query falha.
 */
export function disableDirectDb(reason: string): void {
  if (_dbDisabledUntil <= Date.now()) {
    console.error(
      `[useDirectDb] CIRCUIT BREAKER — Drizzle desabilitado por ${CIRCUIT_BREAKER_MS / 1000}s, ` +
      `fallback Baserow API. Razão: ${reason}`,
    );
  }
  _dbDisabledUntil = Date.now() + CIRCUIT_BREAKER_MS;
}

/**
 * Executa uma função Drizzle com fallback automático.
 * Se a query falha (conexão, timeout, etc), ativa o circuit breaker
 * e retorna undefined para que o caller use o fallback Baserow.
 *
 * Uso:
 * ```ts
 * if (useDirectDb("api")) {
 *   const result = await tryDrizzle(() => db.select().from(table));
 *   if (result !== undefined) return result;
 * }
 * // Baserow fallback...
 * ```
 */
export async function tryDrizzle<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    disableDirectDb((err as Error).message);
    return undefined;
  }
}
