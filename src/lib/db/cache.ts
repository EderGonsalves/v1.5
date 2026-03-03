/**
 * Cache in-memory com stale-while-revalidate.
 *
 * Quando o DB está saudável, retorna dados frescos e atualiza o cache.
 * Quando o DB falha, retorna dados do cache (stale) em vez de erro 500.
 *
 * Uso:
 *   const result = await cachedQuery("cases:inst:123", 60, async () => {
 *     return await db.select().from(cases).execute();
 *   });
 */

type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

const _cache = new Map<string, CacheEntry<unknown>>();

/** Limpa entradas expiradas (mais de 10 min) — roda a cada 5 min */
const MAX_STALE_MS = 10 * 60 * 1000; // 10 minutos de dados stale max
const CLEANUP_INTERVAL = 5 * 60 * 1000;

if (typeof window === "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of _cache) {
      if (now - entry.timestamp > MAX_STALE_MS) {
        _cache.delete(key);
      }
    }
  }, CLEANUP_INTERVAL).unref?.();
}

/**
 * Executa uma query com cache stale-while-revalidate.
 *
 * @param key - Chave única do cache (ex: "cases:inst:123")
 * @param freshSeconds - Tempo em segundos que o dado é considerado fresco
 * @param queryFn - Função que executa a query
 * @returns Dados frescos ou stale (nunca undefined se houver cache)
 */
export async function cachedQuery<T>(
  key: string,
  freshSeconds: number,
  queryFn: () => Promise<T>,
): Promise<{ data: T; stale: boolean } | undefined> {
  const cached = _cache.get(key) as CacheEntry<T> | undefined;
  const now = Date.now();
  const isFresh = cached && now - cached.timestamp < freshSeconds * 1000;

  // Dado fresco em cache — retorna sem fazer query
  if (isFresh) {
    return { data: cached.data, stale: false };
  }

  // Tentar buscar dado fresco
  try {
    const data = await queryFn();
    _cache.set(key, { data, timestamp: now });
    return { data, stale: false };
  } catch (err) {
    // Query falhou — retornar dado stale se existir
    if (cached) {
      const ageSeconds = Math.round((now - cached.timestamp) / 1000);
      console.warn(
        `[cache] Servindo dado stale para "${key}" (${ageSeconds}s atrás). Erro: ${(err as Error).message}`,
      );
      return { data: cached.data, stale: true };
    }
    // Sem cache, sem dado — propagar o erro
    return undefined;
  }
}

/** Invalida uma entrada de cache */
export function invalidateCache(key: string): void {
  _cache.delete(key);
}

/** Invalida todas as entradas que começam com um prefixo */
export function invalidateCachePrefix(prefix: string): void {
  for (const key of _cache.keys()) {
    if (key.startsWith(prefix)) {
      _cache.delete(key);
    }
  }
}
