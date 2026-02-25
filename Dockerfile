# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copiar arquivos de dependências
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Copiar dependências do stage anterior
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Variáveis de ambiente para build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# NEXT_PUBLIC_* precisam existir no build para serem inlined no client JS
# Table IDs removidos — Drizzle ORM acessa PostgreSQL diretamente (USE_DIRECT_DB=true)
# Mantidos apenas: API URL (para proxy fallback/upload), app config, WhatsApp, VAPID
ARG NEXT_PUBLIC_BASEROW_API_URL=https://automation-db.riasistemas.com.br/api
ARG NEXT_PUBLIC_ONBOARDING_API_URL=/api/onboarding
ARG NEXT_PUBLIC_CHAT_POLL_INTERVAL_MS=10000
ARG NEXT_PUBLIC_WHATSAPP_CLIENT_ID=1990068605120799
ARG NEXT_PUBLIC_WHATSAPP_REDIRECT_URI=https://automation-webhook.riasistemas.com.br/webhook/wa/auth
ARG NEXT_PUBLIC_WHATSAPP_CONFIG_ID=1339029904935343
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=BH1YQiNZCrXNA0TmA1HT1woAKtAGpi5XkPinUd59VAH1Fp5_DIdpZV6p_nwAmzNzgz8oaYQhxxMB6cwhmLLdl0c

ENV NEXT_PUBLIC_BASEROW_API_URL=$NEXT_PUBLIC_BASEROW_API_URL
ENV NEXT_PUBLIC_ONBOARDING_API_URL=$NEXT_PUBLIC_ONBOARDING_API_URL
ENV NEXT_PUBLIC_CHAT_POLL_INTERVAL_MS=$NEXT_PUBLIC_CHAT_POLL_INTERVAL_MS
ENV NEXT_PUBLIC_WHATSAPP_CLIENT_ID=$NEXT_PUBLIC_WHATSAPP_CLIENT_ID
ENV NEXT_PUBLIC_WHATSAPP_REDIRECT_URI=$NEXT_PUBLIC_WHATSAPP_REDIRECT_URI
ENV NEXT_PUBLIC_WHATSAPP_CONFIG_ID=$NEXT_PUBLIC_WHATSAPP_CONFIG_ID
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY

# Cache-bust: incrementar quando NEXT_PUBLIC_* mudar para invalidar build cache
# v3: Drizzle ORM migration — removed NEXT_PUBLIC_BASEROW_*_TABLE_ID vars
LABEL build.cache.version="3"

# Build da aplicação
RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# FFmpeg para conversão de áudio para OGG/OPUS (formato WhatsApp)
RUN apk add --no-cache ffmpeg

# Chromium para geração de PDF (puppeteer-core)
RUN apk add --no-cache chromium
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Criar usuário não-root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copiar arquivos necessários
COPY --from=builder /app/public ./public

# Verificar se o standalone existe antes de copiar
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Drizzle ORM: pg e drizzle-orm são carregados via native require (createRequire),
# invisível ao Turbopack, então não são incluídos no standalone output.
# Copiar explicitamente pg + dependências transitivas + drizzle-orm.
COPY --from=deps /app/node_modules/pg ./node_modules/pg
COPY --from=deps /app/node_modules/pg-connection-string ./node_modules/pg-connection-string
COPY --from=deps /app/node_modules/pg-pool ./node_modules/pg-pool
COPY --from=deps /app/node_modules/pg-protocol ./node_modules/pg-protocol
COPY --from=deps /app/node_modules/pg-types ./node_modules/pg-types
COPY --from=deps /app/node_modules/pg-int8 ./node_modules/pg-int8
COPY --from=deps /app/node_modules/pgpass ./node_modules/pgpass
COPY --from=deps /app/node_modules/postgres-array ./node_modules/postgres-array
COPY --from=deps /app/node_modules/postgres-bytea ./node_modules/postgres-bytea
COPY --from=deps /app/node_modules/postgres-date ./node_modules/postgres-date
COPY --from=deps /app/node_modules/postgres-interval ./node_modules/postgres-interval
COPY --from=deps /app/node_modules/split2 ./node_modules/split2
COPY --from=deps /app/node_modules/xtend ./node_modules/xtend
COPY --from=deps /app/node_modules/drizzle-orm ./node_modules/drizzle-orm

# Verificar se server.js existe
RUN test -f server.js || (echo "ERRO: server.js não encontrado!" && exit 1)

# Ajustar permissões
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Healthcheck básico
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {let data='';r.on('data',(c)=>{data+=c});r.on('end',()=>{try{const json=JSON.parse(data);process.exit(json.status==='ok'?0:1)}catch(e){process.exit(r.statusCode===200?0:1)}})}).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]

