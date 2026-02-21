# Plano: PWA com Push Notifications (VAPID) — Briefing Jurídico

## Contexto

O app Briefing Jurídico (`waba.riasistemas.com.br`) atualmente não é instalável como PWA e não possui notificações push. O objetivo é torná-lo um Progressive Web App completo com:
- Instalação via modal customizado (não o prompt nativo do browser)
- Push notifications via VAPID (Web Push API)
- Página SysAdmin para envio de notificações
- Modais de permissão para notificações, localização, áudio e câmera

---

## Fase 1 — Fundação PWA

### 1.1 Instalar dependência
```bash
npm install web-push
```

### 1.2 Gerar ícones PWA
Criar `public/icons/` com 4 imagens geradas a partir do `public/icon.png` existente:
- `icon-192x192.png`, `icon-512x512.png`
- `icon-maskable-192x192.png`, `icon-maskable-512x512.png`

### 1.3 CRIAR `src/app/manifest.ts`
Manifest dinâmico via Next.js Metadata API (gera `/manifest.webmanifest` automaticamente):
- `name`: "Briefing Jurídico"
- `short_name`: "BJ"
- `start_url`: "/casos"
- `display`: "standalone"
- `background_color` / `theme_color`: "#1B263B" (Navy-800)
- `icons`: os 4 ícones acima (any + maskable)

### 1.4 MODIFICAR `src/app/layout.tsx`
Atualizar metadata existente (L18-26):
- Alterar `title` para "Briefing Jurídico"
- Adicionar `manifest: "/manifest.webmanifest"`
- Adicionar `themeColor: "#1B263B"`
- Adicionar `appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Briefing Jurídico" }`
- Apple icon apontar para `/icons/icon-192x192.png`

### 1.5 CRIAR `public/sw.js`
Service worker simples em JS puro (sem Workbox/next-pwa):
- **install**: pre-cache da página offline
- **activate**: limpa caches antigos
- **fetch**: network-first para navegação, fallback offline
- **push**: recebe payload JSON `{ title, body, url, icon, tag }` → `showNotification()`
- **notificationclick**: foca/abre janela na URL do payload

### 1.6 CRIAR `src/components/pwa/ServiceWorkerRegister.tsx`
Client component que registra `/sw.js` no mount. Renderiza `null`. Colocado no `layout.tsx` (fora dos providers, pois não depende de auth).

### 1.7 CRIAR `src/app/offline/page.tsx`
Página fallback simples: ícone + "Sem conexão" + instrução.

---

## Fase 2 — Infraestrutura Push (VAPID)

### 2.1 Gerar chaves VAPID
```bash
npx web-push generate-vapid-keys
```

### 2.2 Novas variáveis de ambiente
| Variável | Lado | Descrição |
|----------|------|-----------|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Client+Server | Chave pública VAPID |
| `VAPID_PRIVATE_KEY` | Server | Chave privada VAPID |
| `VAPID_SUBJECT` | Server | `mailto:suporte@riasistemas.com.br` |
| `BASEROW_PUSH_SUBSCRIPTIONS_TABLE_ID` | Server | Tabela 254 |
| `BASEROW_PUSH_NOTIFICATIONS_TABLE_ID` | Server | Tabela 255 |

Adicionar em: `.env`, `stack.yml`, `Dockerfile` (ARG para NEXT_PUBLIC_VAPID_PUBLIC_KEY).

### 2.3 Criar tabelas no Baserow

**Tabela 254 — `push_subscriptions`:**
| Campo | Tipo |
|-------|------|
| endpoint | Text (URL do push subscription) |
| p256dh | Text (chave pública client, base64) |
| auth | Text (auth secret, base64) |
| user_email | Text |
| user_name | Text |
| legacy_user_id | Text |
| institution_id | Number |
| user_agent | Text |
| created_at | Text (ISO) |
| updated_at | Text (ISO) |

**Tabela 255 — `push_notifications`:**
| Campo | Tipo |
|-------|------|
| title | Text |
| body | Long Text |
| url | Text |
| icon | Text |
| institution_id | Number (0=todas) |
| sent_by_email | Text |
| sent_by_name | Text |
| sent_at | Text (ISO) |
| recipients_count | Number |
| status | Text (sent/partial_failure/failed) |
| error_log | Long Text |

### 2.4 CRIAR `src/services/push.ts` (server-only)
Segue padrão de `src/services/lawsuit.ts`. Usa `baserowGet/Post/Patch/Delete` de `src/services/api.ts` e `web-push`:
- `saveSubscription()` — upsert por endpoint (busca existente, atualiza ou cria)
- `removeSubscription()` — deleta por endpoint
- `getSubscriptionsByInstitution()` — filtra por institution_id
- `getAllSubscriptions()` — todas (para SysAdmin enviar para todos)
- `sendPushToSubscriptions()` — loop com `webpush.sendNotification()`, remove 410 Gone
- `createNotificationRecord()` — salva no histórico (tabela 255)
- `getNotificationHistory()` — lista paginada

### 2.5 CRIAR `src/services/push-client.ts` (client fetch wrappers)
Segue padrão de `src/services/lawsuit-client.ts`:
- `subscribePush(subscription)` → `POST /api/v1/push/subscribe`
- `unsubscribePush(endpoint)` → `DELETE /api/v1/push/subscribe`
- `sendPushNotification(payload)` → `POST /api/v1/push/send`
- `fetchPushHistory()` → `GET /api/v1/push/history`

### 2.6 API Routes

**CRIAR `src/app/api/v1/push/subscribe/route.ts`** (POST + DELETE)
- Auth via `getRequestAuth()`
- POST: valida subscription (endpoint + keys), salva com dados do auth
- DELETE: valida endpoint, remove

**CRIAR `src/app/api/v1/push/send/route.ts`** (POST)
- Auth via `getRequestAuth()`
- Guard: `isGlobalAdmin()` de `src/services/departments.ts` (L150)
- Valida title + body obrigatórios
- Busca subscriptions por institution ou todas
- Envia push, salva no histórico
- Retorna `{ sent, failed }`

**CRIAR `src/app/api/v1/push/history/route.ts`** (GET)
- Auth + SysAdmin guard
- Retorna lista paginada do histórico

---

## Fase 3 — Hooks + Modais de Permissão

### 3.1 CRIAR `src/hooks/use-pwa-install.ts`
- Intercepta `beforeinstallprompt`, armazena deferred prompt
- Detecta standalone mode (já instalado)
- Expõe: `isInstallable`, `isInstalled`, `promptInstall()`

### 3.2 CRIAR `src/hooks/use-push-subscription.ts`
- Verifica suporte (ServiceWorker + PushManager + Notification)
- Checa subscription existente via `pushManager.getSubscription()`
- `subscribe()`: pede permissão → `pushManager.subscribe()` com VAPID key → salva no server
- `unsubscribe()`: remove local + server
- Expõe: `isSubscribed`, `isSupported`, `permission`, `subscribe()`, `unsubscribe()`

### 3.3 CRIAR `src/hooks/use-permissions.ts`
- Consulta `navigator.permissions.query()` para geolocation, microphone, camera
- Escuta mudanças via `status.addEventListener("change")`
- `requestGeolocation()` → `navigator.geolocation.getCurrentPosition()`
- `requestMediaPermission("microphone"|"camera")` → `getUserMedia()` + libera tracks
- Expõe: `permissions` state, `requestGeolocation()`, `requestMediaPermission()`

### 3.4 CRIAR `src/components/pwa/PwaInstallPrompt.tsx`
Modal customizado (Radix Dialog) que aparece 3s após login se `isInstallable`:
- Mostra benefícios (acesso rápido, notificações, offline)
- Botão "Instalar" → chama `promptInstall()`
- Botão "Agora não" → salva dismiss em localStorage (7 dias cooldown)

### 3.5 CRIAR `src/components/pwa/NotificationPermissionModal.tsx`
Modal customizado que aparece 6s após login se permissão é "default":
- Explica quais notificações serão recebidas
- Botão "Ativar" → chama `subscribe()` do hook (que chama `Notification.requestPermission()`)
- Botão "Depois" → dismiss 7 dias
- Auto-subscribe silencioso se permissão já "granted" mas não subscrito

### 3.6 CRIAR `src/components/pwa/PermissionsGateModal.tsx`
Modal genérico para permissões sob demanda (localização, microfone, câmera):
- Props: `permission: "geolocation"|"microphone"|"camera"`, `open`, `onOpenChange`, `onGranted`, `onDenied`
- Usa `PERMISSION_CONFIG` map para ícone, label, descrição por tipo
- Mostra explicação antes de triggerar o prompt do browser
- Callback `onGranted/onDenied` para o componente chamador

### 3.7 CRIAR `src/components/pwa/PwaModals.tsx`
Componente agregador que renderiza `<PwaInstallPrompt />` + `<NotificationPermissionModal />`.

### 3.8 MODIFICAR `src/components/AppShell.tsx`
Adicionar `<PwaModals />` dentro do bloco autenticado (L82, após `<Header />`):
```tsx
import { PwaModals } from "@/components/pwa/PwaModals";
// ...
<Header />
<PwaModals />
<main className="flex-1">{children}</main>
```
Garante que modais só aparecem para usuários logados.

---

## Fase 4 — Página SysAdmin de Notificações

### 4.1 CRIAR `src/app/notificacoes/page.tsx`
Segue padrão layout: `min-h-screen bg-background py-4` + `max-w-5xl` + `border-b border-[#7E99B5]`.

**Formulário de envio:**
- Título (Input, max 100 chars)
- Mensagem (Textarea)
- URL destino (Input, opcional, default "/casos")
- Destino (select: "Todas as instituições" ou específica)
- Botão Enviar → `POST /api/v1/push/send`
- Feedback: "Enviado para X dispositivo(s)" ou erro

**Histórico:**
- Tabela/lista de notificações enviadas
- Mostra: título, corpo (truncado), enviado por, data, destinatários, status badge
- Refresh manual
- Guard: `institutionId !== 4` mostra "Acesso restrito"

### 4.2 MODIFICAR `src/components/Sidebar.tsx`
Adicionar `Bell` ao import do lucide-react (L5-21).
Adicionar ao `NAV_ITEMS` (L36-46), antes de Suporte:
```ts
{ href: "/notificacoes", label: "Notificações", icon: Bell, requiresSysAdmin: true }
```
`requiresSysAdmin: true` garante que só aparece para institutionId=4 (já filtrado na L62).

### 4.3 MODIFICAR `src/lib/feature-registry.ts`
Adicionar ao `SYSTEM_FEATURES` (L7-18):
```ts
{ key: "notificacoes", path: "/notificacoes", label: "Notificações" },
```

---

## Fase 5 — Integração e Polish

### 5.1 MODIFICAR `src/components/onboarding/onboarding-context.tsx`
No `logout()`, limpar localStorage do PWA:
```ts
localStorage.removeItem("pwa_install_dismissed");
localStorage.removeItem("notification_perm_dismissed");
```

### 5.2 MODIFICAR `src/middleware.ts` (se necessário)
Se o subscribe falhar por CSRF, adicionar `/api/v1/push/subscribe` ao `CSRF_EXEMPT_PATHS`.

---

## Resumo de Arquivos

### Novos (16 arquivos)
| Arquivo | Descrição |
|---------|-----------|
| `src/app/manifest.ts` | Manifest PWA dinâmico |
| `public/sw.js` | Service worker (push + cache + offline) |
| `public/icons/*.png` (4) | Ícones PWA 192/512 + maskable |
| `src/app/offline/page.tsx` | Página offline fallback |
| `src/components/pwa/ServiceWorkerRegister.tsx` | Registro do SW |
| `src/components/pwa/PwaInstallPrompt.tsx` | Modal de instalação |
| `src/components/pwa/NotificationPermissionModal.tsx` | Modal de notificações |
| `src/components/pwa/PermissionsGateModal.tsx` | Modal genérico permissões |
| `src/components/pwa/PwaModals.tsx` | Agregador dos modais |
| `src/hooks/use-pwa-install.ts` | Hook instalação PWA |
| `src/hooks/use-push-subscription.ts` | Hook push subscription |
| `src/hooks/use-permissions.ts` | Hook permissões browser |
| `src/services/push.ts` | Serviço server push (web-push + Baserow) |
| `src/services/push-client.ts` | Client fetch wrappers |
| `src/app/api/v1/push/subscribe/route.ts` | API subscribe/unsubscribe |
| `src/app/api/v1/push/send/route.ts` | API enviar push (SysAdmin) |
| `src/app/api/v1/push/history/route.ts` | API histórico |
| `src/app/notificacoes/page.tsx` | Página SysAdmin |

### Modificados (5 arquivos)
| Arquivo | Mudança |
|---------|---------|
| `src/app/layout.tsx` | title → "Briefing Jurídico", manifest, themeColor, appleWebApp, `<ServiceWorkerRegister />` |
| `src/components/AppShell.tsx` | `<PwaModals />` no bloco autenticado |
| `src/components/Sidebar.tsx` | Nav item "Notificações" (Bell, requiresSysAdmin) |
| `src/lib/feature-registry.ts` | Feature "notificacoes" |
| `src/components/onboarding/onboarding-context.tsx` | Limpar localStorage PWA no logout |

### Dependência
```
npm install web-push
```

---

## Verificação

1. **PWA instalável**: Abrir DevTools > Application > Manifest — verificar que ícones, nome e start_url estão corretos. Testar "Install" no browser.
2. **Service Worker**: DevTools > Application > Service Workers — verificar registro ativo.
3. **Push subscription**: Aceitar notificação no modal → verificar registro criado na tabela 254 do Baserow.
4. **Envio push**: Ir em /notificacoes como SysAdmin → enviar notificação → verificar recebimento no dispositivo inscrito.
5. **Histórico**: Verificar que a notificação aparece na lista com contagem correta.
6. **Offline**: Desconectar rede → navegar → ver página offline.
7. **Permissões**: Testar modal de microfone (ao gravar áudio no chat), localização e câmera.
8. **Dark mode**: Verificar todos os modais em dark mode.
