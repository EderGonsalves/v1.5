# Plano: Sistema de Onboarding Automático (Feature Tour)

## Contexto

O app Onboarding (`waba.riasistemas.com.br`) é rico em funcionalidades mas não possui nenhum guia para novos usuários. O objetivo é implementar um **tour guiado estilo spotlight/tooltip** que destaque os elementos da interface com overlay escuro e tooltip explicativo, similar ao Shepherd.js/Intro.js.

**Requisitos definidos pelo usuário:**
- Estilo: **Spotlight/Tooltip** (overlay escuro + tooltip ao lado do elemento)
- Acionamento: **Primeiro login + botão replay** (manual a qualquer momento)
- Personalização: **Por role** (SysAdmin completo, OfficeAdmin administrativo, Usuário básico)

---

## Biblioteca: driver.js

**Escolha: `driver.js` v1.3+ (~5KB gzipped)**

- Leve (~5KB vs ~50KB react-joyride)
- Framework-agnostic — sem conflitos com React 19
- Spotlight SVG com animação suave (funciona com `position: fixed` da sidebar/header)
- CSS customizável (fácil adaptar à paleta Navy + dark mode)
- API imperativa que integra bem com React hooks via `useRef`
- Scroll-into-view e responsive automáticos

```bash
npm install driver.js
```

---

## Fase 1 — Fundação

### 1.1 CRIAR `src/lib/tour/tour-steps.ts`

Define todos os steps do tour como dados, filtrados por role.

```typescript
export type TourRole = "user" | "officeAdmin" | "sysAdmin";

export type TourStep = {
  element: string;      // CSS selector (data-tour attribute)
  title: string;        // pt-BR
  description: string;  // pt-BR
  side: "top" | "bottom" | "left" | "right";
  minRole: TourRole;    // Mínimo necessário para ver este step
};
```

**Steps por role:**

| # | Elemento | Título | minRole |
|---|----------|--------|---------|
| 1 | `[data-tour="sidebar"]` | Menu de Navegação | user |
| 2 | `[data-tour="nav-casos"]` | Casos / Atendimentos | user |
| 3 | `[data-tour="nav-chat"]` | Chat | user |
| 4 | `[data-tour="nav-agenda"]` | Agenda | user |
| 5 | `[data-tour="nav-suporte"]` | Suporte | user |
| 6 | `[data-tour="header-ai-toggle"]` | Conectar / Desconectar I.A. | user |
| 7 | `[data-tour="header-dark-mode"]` | Modo Escuro | user |
| 8 | `[data-tour="header-my-account"]` | Minha Conta | user |
| 9 | `[data-tour="nav-usuarios"]` | Gerenciar Usuários | officeAdmin |
| 10 | `[data-tour="nav-departamentos"]` | Departamentos | officeAdmin |
| 11 | `[data-tour="nav-follow-up"]` | Follow-up | officeAdmin |
| 12 | `[data-tour="nav-estatisticas"]` | Estatísticas | officeAdmin |
| 13 | `[data-tour="nav-conexoes"]` | Conexões | sysAdmin |
| 14 | `[data-tour="nav-notificacoes"]` | Notificações Push | sysAdmin |
| 15 | `[data-tour="nav-permissoes"]` | Permissões | sysAdmin |
| 16 | `[data-tour="nav-configuracoes"]` | Configurações do Sistema | sysAdmin |

Função `getStepsForRole(role)` filtra steps onde `ROLE_PRIORITY[step.minRole] <= ROLE_PRIORITY[role]`.

### 1.2 CRIAR `src/lib/tour/tour-config.ts`

Configuração do driver.js + constantes de localStorage.

```typescript
export const DRIVER_CONFIG = {
  showProgress: true,
  animate: true,
  overlayColor: "rgba(13, 27, 42, 0.75)", // Navy-900 at 75%
  stagePadding: 8,
  stageRadius: 8,
  popoverClass: "tour-popover",
  smoothScroll: true,
  allowClose: true,
  progressText: "{{current}} de {{total}}",
  nextBtnText: "Próximo",
  prevBtnText: "Anterior",
  doneBtnText: "Concluir",
};

export const TOUR_COMPLETED_KEY = "feature_tour_completed";
export const CURRENT_TOUR_VERSION = 1; // Incrementar para forçar re-exibição
```

---

## Fase 2 — Hook + Provider

### 2.1 CRIAR `src/hooks/use-feature-tour.ts`

Hook principal que gerencia o driver.js, persistência e lógica de role.

**API exposta:**
```typescript
{
  startTour: () => void;         // Inicia/reinicia o tour
  autoStartIfNeeded: () => boolean; // Auto-start no primeiro login
  isRunning: boolean;
  isReady: boolean;              // Permissões carregadas
  hasCompleted: boolean;
  role: TourRole;
}
```

**Lógica chave:**
- Usa `usePermissionsStatus` + `useMyDepartments` para determinar role efetivo
- Persiste em localStorage com chave per-user: `feature_tour_completed_{instId}_{legacyUserId}`
- Valor: `{ version: 1, completedAt: timestamp }`
- Filtra steps no runtime via `document.querySelector()` (se nav item não existe no DOM por permissões, step é omitido)
- Cleanup do driver instance no unmount

### 2.2 CRIAR `src/components/tour/TourProvider.tsx`

Componente renderless que orquestra o auto-start.

**Timing:**
- Espera **8 segundos** após mount (PwaModals usa 4s)
- Verifica se há algum Dialog Radix aberto (`[data-state="open"][role="dialog"]`)
- Se dialog aberto, retry em 3s
- Chama `autoStartIfNeeded()` apenas uma vez

### 2.3 CRIAR `src/components/tour/TourReplayButton.tsx`

Botão no rodapé da sidebar (antes do "Sair").

- Ícone: `HelpCircle` (lucide-react)
- Label: "Tour Guiado" (colapsado: apenas ícone com title tooltip)
- Props: `isCollapsed`, `isMobile` (segue padrão dos outros botões da sidebar)

---

## Fase 3 — Integração nos Arquivos Existentes

### 3.1 MODIFICAR `src/components/Sidebar.tsx`

**Adicionar `data-tour` em cada `<Link>` nav item (L140):**
```tsx
<Link
  key={item.href}
  href={item.href}
  data-tour={`nav-${item.href.replace(/^\//, "").replace(/\//g, "-")}`}
  // ... resto igual
>
```

**Adicionar `data-tour` no Suporte (construído separado, L83-85):**
- `data-tour="nav-suporte"` no Link de Suporte

**Adicionar `data-tour` no Permissões (L74-81):**
- `data-tour="nav-permissoes"` no Link de Permissões

**Adicionar `data-tour="sidebar"` no aside desktop (L202):**
```tsx
<aside data-sidebar data-tour="sidebar" className={...}>
```

**Renderizar `<TourReplayButton>` no bottom section (L161), antes do botão Sair:**
```tsx
<div className="border-t border-sidebar-border p-2 shrink-0">
  <TourReplayButton isCollapsed={isCollapsed} isMobile={mobile} />
  <button onClick={handleLogout} ...>...</button>
</div>
```

### 3.2 MODIFICAR `src/components/Header.tsx`

Adicionar 3 atributos `data-tour`:

| Elemento | Linha | Atributo |
|----------|-------|----------|
| AI Toggle wrapper `<div>` | L248 | `data-tour="header-ai-toggle"` |
| Dark Mode `<Button>` | L290 | `data-tour="header-dark-mode"` |
| My Account `<Button>` | L306 | `data-tour="header-my-account"` |

### 3.3 MODIFICAR `src/components/AppShell.tsx`

Adicionar `<TourProvider />` ao lado de `<PwaModals />` (L84):

```tsx
import { TourProvider } from "@/components/tour/TourProvider";
// ...
<Header />
<PwaModals />
<TourProvider />
<main className="flex-1">{children}</main>
```

### 3.4 MODIFICAR `src/components/onboarding/onboarding-context.tsx`

No `logout()` (L132-147), limpar o localStorage do tour do usuário atual:

```typescript
// Após os removeItem existentes:
const tourKey = `feature_tour_completed_${data.auth?.institutionId}_${data.auth?.legacyUserId ?? "anon"}`;
localStorage.removeItem(tourKey);
```

### 3.5 MODIFICAR `src/app/globals.css`

Adicionar ao final do arquivo as customizações CSS do driver.js para:
- Usar CSS variables do design system (--card, --border, --foreground, --primary, etc.)
- z-index: overlay 9998, active element 9999, popover 10000 (acima da sidebar z-30 e header z-40)
- Dark mode: overrides para título e descrição com cores Navy explícitas
- Botões: "Próximo" com --primary bg, "Anterior" com border ghost

---

## Fase 4 — Mobile

**Problema:** No mobile, a sidebar é um drawer e fica fechada. Os steps que targetam nav items da sidebar não encontrarão os elementos visíveis.

**Solução:**
- No hook `use-feature-tour.ts`, adicionar handler `onHighlightStarted` que despacha `CustomEvent("tour:open-mobile-sidebar")` quando o elemento está dentro de `[data-sidebar]` e `window.innerWidth < 1024`
- No `Sidebar.tsx`, escutar este evento e chamar `openMobile()` via `useSidebar()`

---

## Resumo de Arquivos

### Novos (5 arquivos)
| Arquivo | Descrição |
|---------|-----------|
| `src/lib/tour/tour-steps.ts` | Definição de todos os steps por role |
| `src/lib/tour/tour-config.ts` | Config driver.js + constantes localStorage |
| `src/hooks/use-feature-tour.ts` | Hook principal (driver instance, persistência, role) |
| `src/components/tour/TourProvider.tsx` | Orquestrador auto-start (renderless) |
| `src/components/tour/TourReplayButton.tsx` | Botão replay na sidebar |

### Modificados (5 arquivos)
| Arquivo | Mudança |
|---------|---------|
| `src/components/Sidebar.tsx` | `data-tour` em nav items + `<TourReplayButton>` no footer |
| `src/components/Header.tsx` | `data-tour` em 3 elementos (AI toggle, dark mode, my account) |
| `src/components/AppShell.tsx` | `<TourProvider />` após `<PwaModals />` |
| `src/components/onboarding/onboarding-context.tsx` | Limpar tour key no logout |
| `src/app/globals.css` | CSS theme overrides para driver.js |

### Dependência
```bash
npm install driver.js
```

---

## Sequência de Implementação

1. `npm install driver.js`
2. Criar `src/lib/tour/tour-steps.ts` + `src/lib/tour/tour-config.ts`
3. Criar `src/hooks/use-feature-tour.ts`
4. Adicionar CSS overrides em `globals.css`
5. Adicionar `data-tour` attributes em `Sidebar.tsx` e `Header.tsx`
6. Criar `src/components/tour/TourReplayButton.tsx`
7. Criar `src/components/tour/TourProvider.tsx`
8. Integrar `<TourProvider />` em `AppShell.tsx`
9. Integrar `<TourReplayButton />` em `Sidebar.tsx`
10. Limpar tour key no logout (`onboarding-context.tsx`)

---

## Verificação

1. **Primeiro login**: Fazer login com conta nova → tour deve iniciar automaticamente após ~8s
2. **Steps por role**: Login como User → 8 steps. OfficeAdmin → 12 steps. SysAdmin → 16 steps
3. **Spotlight**: Overlay escuro com recorte no elemento, tooltip ao lado
4. **Navegação**: Próximo/Anterior/Concluir funcionando. Progress "X de Y" visível
5. **Persistência**: Fechar e reabrir o app → tour NÃO reaparece
6. **Replay**: Clicar "Tour Guiado" na sidebar → tour reinicia
7. **Dark mode**: Popover legível em ambos os temas
8. **Mobile**: Sidebar drawer abre automaticamente quando step é de nav item
9. **Sem conflito**: Tour não aparece enquanto PwaModals está aberto
10. **Logout**: Tour resetado — ao logar com outro usuário, tour aparece novamente
