/**
 * Feature flags para migração incremental Baserow → PostgreSQL direto.
 *
 * Controle via env var DIRECT_DB_TABLES (comma-separated):
 *   DIRECT_DB_TABLES=push,support,lawsuit,sign,docs
 *
 * Ou USE_DIRECT_DB=true para ativar tudo de uma vez.
 *
 * Circuit breaker PER-DOMAIN: quando uma query de um domínio falha,
 * apenas aquele domínio volta ao Baserow API por 30s. Outros domínios
 * continuam usando Drizzle normalmente.
 */

const USE_DIRECT_DB = process.env.USE_DIRECT_DB === "true";

const DIRECT_TABLES = new Set(
  (process.env.DIRECT_DB_TABLES || "").split(",").map((s) => s.trim()).filter(Boolean),
);

const _domainDisabledUntil = new Map<string, number>();
const CIRCUIT_BREAKER_MS = 30_000; // retry após 30s

/**
 * Verifica se uma tabela/domínio deve usar acesso direto ao PostgreSQL.
 *
 * @param domain - Nome do domínio (ex: "push", "support", "cases", "chat", "api")
 * @returns true se deve usar Drizzle, false para usar Baserow API
 */
export function useDirectDb(domain: string): boolean {
  if (typeof window !== "undefined") return false;
  const disabledUntil = _domainDisabledUntil.get(domain) ?? 0;
  if (disabledUntil > Date.now()) return false;
  if (USE_DIRECT_DB) return true;
  return DIRECT_TABLES.has(domain);
}

/**
 * Desabilita temporariamente o acesso direto ao DB para um domínio específico.
 * Chamado automaticamente por tryDrizzle() quando uma query falha.
 */
export function disableDirectDb(domain: string, reason: string): void {
  const disabledUntil = _domainDisabledUntil.get(domain) ?? 0;
  if (disabledUntil <= Date.now()) {
    console.error(
      `[useDirectDb] CIRCUIT BREAKER (${domain}) — Drizzle desabilitado por ${CIRCUIT_BREAKER_MS / 1000}s, ` +
      `fallback Baserow API. Razão: ${reason}`,
    );
  }
  _domainDisabledUntil.set(domain, Date.now() + CIRCUIT_BREAKER_MS);
}

/**
 * Executa uma função Drizzle com fallback automático.
 * Se a query falha, ativa o circuit breaker para o domínio e retorna undefined.
 *
 * Suporta duas assinaturas:
 *   tryDrizzle("chat", async () => { ... })   — per-domain circuit breaker
 *   tryDrizzle(async () => { ... })            — usa domínio "default" (backward compat)
 */
export async function tryDrizzle<T>(
  domainOrFn: string | (() => Promise<T>),
  fn?: () => Promise<T>,
): Promise<T | undefined> {
  const domain = typeof domainOrFn === "string" ? domainOrFn : "default";
  const actualFn = typeof domainOrFn === "string" ? fn! : domainOrFn;

  try {
    return await actualFn();
  } catch (err) {
    const error = err as Error;
    const cause = (err as { cause?: Error }).cause;
    const detail = cause ? `${error.message} | cause: ${cause.message}` : error.message;
    disableDirectDb(domain, detail);
    return undefined;
  }
}
