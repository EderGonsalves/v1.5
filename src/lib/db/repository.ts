/**
 * Feature flags para migração incremental Baserow → PostgreSQL direto.
 *
 * Controle via env var DIRECT_DB_TABLES (comma-separated):
 *   DIRECT_DB_TABLES=push,support,lawsuit,sign,docs
 *
 * Ou USE_DIRECT_DB=true para ativar tudo de uma vez.
 *
 * Circuit breaker PER-DOMAIN: quando uma query de um domínio falha,
 * apenas aquele domínio volta ao Baserow API por 10s. Outros domínios
 * continuam usando Drizzle normalmente.
 */

const USE_DIRECT_DB = process.env.USE_DIRECT_DB === "true";

const DIRECT_TABLES = new Set(
  (process.env.DIRECT_DB_TABLES || "").split(",").map((s) => s.trim()).filter(Boolean),
);

const _domainDisabledUntil = new Map<string, number>();
const CIRCUIT_BREAKER_MS = 10_000; // retry após 10s

/**
 * Verifica se uma tabela/domínio deve usar acesso direto ao PostgreSQL.
 *
 * Quando USE_DIRECT_DB=true, SEMPRE retorna true (sem circuit breaker no Drizzle).
 * O circuit breaker do Drizzle só atua no modo parcial (DIRECT_DB_TABLES).
 */
export function useDirectDb(domain: string): boolean {
  if (typeof window !== "undefined") return false;
  if (USE_DIRECT_DB) return true;
  const disabledUntil = _domainDisabledUntil.get(domain) ?? 0;
  if (disabledUntil > Date.now()) return false;
  return DIRECT_TABLES.has(domain);
}

/**
 * Desabilita temporariamente o acesso direto ao DB para um domínio específico.
 * Só tem efeito quando usando DIRECT_DB_TABLES (migração parcial).
 */
export function disableDirectDb(domain: string, reason: string): void {
  if (USE_DIRECT_DB) {
    // Modo full-direct: apenas logar, sem desabilitar Drizzle
    console.error(`[Drizzle] Query falhou (${domain}): ${reason}`);
    return;
  }
  const disabledUntil = _domainDisabledUntil.get(domain) ?? 0;
  if (disabledUntil <= Date.now()) {
    console.error(
      `[useDirectDb] CIRCUIT BREAKER (${domain}) — Drizzle desabilitado por ${CIRCUIT_BREAKER_MS / 1000}s, ` +
      `fallback Baserow API. Razão: ${reason}`,
    );
  }
  _domainDisabledUntil.set(domain, Date.now() + CIRCUIT_BREAKER_MS);
}

/** Pausa assíncrona */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Executa uma função Drizzle com fallback automático.
 *
 * - Modo full (USE_DIRECT_DB=true): faz 1 retry com backoff antes de retornar undefined.
 * - Modo parcial (DIRECT_DB_TABLES): circuit breaker + retorna undefined (fallback Baserow).
 *
 * Retorna undefined quando falha — os serviços fazem fallback ao Baserow,
 * que tem seu próprio circuit breaker para evitar sobrecarga.
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

    // Modo full-direct: 1 retry após 2s antes de retornar undefined
    if (USE_DIRECT_DB) {
      console.warn(`[Drizzle] Query falhou (${domain}), retentando em 2s: ${detail}`);
      try {
        await sleep(2_000);
        return await actualFn();
      } catch (retryErr) {
        const retryError = retryErr as Error;
        const retryCause = (retryErr as { cause?: Error }).cause;
        const retryDetail = retryCause
          ? `${retryError.message} | cause: ${retryCause.message}`
          : retryError.message;
        console.error(`[Drizzle] Retry também falhou (${domain}): ${retryDetail}`);
        return undefined;
      }
    }

    // Modo parcial: circuit breaker normal
    disableDirectDb(domain, detail);
    return undefined;
  }
}
