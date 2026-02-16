export type SystemFeature = {
  key: string;
  path: string;
  label: string;
};

export const SYSTEM_FEATURES: SystemFeature[] = [
  { key: "casos", path: "/casos", label: "Casos" },
  { key: "chat", path: "/chat", label: "Chat" },
  { key: "agenda", path: "/agenda", label: "Agenda" },
  { key: "estatisticas", path: "/estatisticas", label: "Estatísticas" },
  { key: "configuracoes", path: "/configuracoes", label: "Configurações" },
  { key: "conexoes", path: "/conexoes", label: "Conexões" },
  { key: "follow-up", path: "/follow-up", label: "Follow-up" },
  { key: "usuarios", path: "/usuarios", label: "Usuários" },
  { key: "departamentos", path: "/departamentos", label: "Departamentos" },
  { key: "suporte", path: "/suporte", label: "Suporte" },
  { key: "notificacoes", path: "/notificacoes", label: "Notificações" },
];

export const ALWAYS_ALLOWED_PATHS = ["/", "/configuracoes/permissoes", "/minha-conta"];

export const ALL_FEATURE_PATHS = SYSTEM_FEATURES.map((f) => f.path);

// Features que por padrão ficam ocultas para usuários comuns (requerem habilitação explícita pelo admin)
export const ADMIN_DEFAULT_FEATURES = ["agenda", "estatisticas", "configuracoes", "conexoes", "follow-up"];

// Ações que podem ser habilitadas por usuário pelo admin (não são páginas)
export const USER_ACTION_FEATURES: SystemFeature[] = [
  { key: "criar_caso", path: "", label: "Criar Caso" },
];
