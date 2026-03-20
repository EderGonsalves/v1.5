/**
 * Predefined tags for the classification system.
 * These are seeded into institution_tags when a new institution is set up.
 */

export type PredefinedTag = {
  category: string;
  name: string;
  color: string;
  parentName?: string;
  sortOrder: number;
};

// ---------------------------------------------------------------------------
// Áreas do Direito (16)
// ---------------------------------------------------------------------------

const AREAS_DIREITO: PredefinedTag[] = [
  { category: "area_direito", name: "Direito Civil", color: "#3B82F6", sortOrder: 1 },
  { category: "area_direito", name: "Direito Penal", color: "#EF4444", sortOrder: 2 },
  { category: "area_direito", name: "Direito Trabalhista", color: "#F59E0B", sortOrder: 3 },
  { category: "area_direito", name: "Direito do Consumidor", color: "#10B981", sortOrder: 4 },
  { category: "area_direito", name: "Direito de Família", color: "#EC4899", sortOrder: 5 },
  { category: "area_direito", name: "Direito Empresarial", color: "#8B5CF6", sortOrder: 6 },
  { category: "area_direito", name: "Direito Tributário", color: "#6366F1", sortOrder: 7 },
  { category: "area_direito", name: "Direito Imobiliário", color: "#14B8A6", sortOrder: 8 },
  { category: "area_direito", name: "Direito Administrativo", color: "#64748B", sortOrder: 9 },
  { category: "area_direito", name: "Direito Previdenciário", color: "#0EA5E9", sortOrder: 10 },
  { category: "area_direito", name: "Direito Ambiental", color: "#22C55E", sortOrder: 11 },
  { category: "area_direito", name: "Direito Digital", color: "#A855F7", sortOrder: 12 },
  { category: "area_direito", name: "Direito Internacional", color: "#06B6D4", sortOrder: 13 },
  { category: "area_direito", name: "Direito Constitucional", color: "#F97316", sortOrder: 14 },
  { category: "area_direito", name: "Direito Eleitoral", color: "#84CC16", sortOrder: 15 },
  { category: "area_direito", name: "Direito Militar", color: "#78716C", sortOrder: 16 },
];

// ---------------------------------------------------------------------------
// Sub-áreas (98)
// ---------------------------------------------------------------------------

const SUB_AREAS: PredefinedTag[] = [
  // Direito Civil
  { category: "sub_area", name: "Contratos", color: "#3B82F6", parentName: "Direito Civil", sortOrder: 1 },
  { category: "sub_area", name: "Responsabilidade Civil", color: "#3B82F6", parentName: "Direito Civil", sortOrder: 2 },
  { category: "sub_area", name: "Direito das Obrigações", color: "#3B82F6", parentName: "Direito Civil", sortOrder: 3 },
  { category: "sub_area", name: "Direitos Reais", color: "#3B82F6", parentName: "Direito Civil", sortOrder: 4 },
  { category: "sub_area", name: "Sucessões", color: "#3B82F6", parentName: "Direito Civil", sortOrder: 5 },
  { category: "sub_area", name: "Posse e Propriedade", color: "#3B82F6", parentName: "Direito Civil", sortOrder: 6 },
  { category: "sub_area", name: "Indenização", color: "#3B82F6", parentName: "Direito Civil", sortOrder: 7 },
  // Direito Penal
  { category: "sub_area", name: "Crimes contra a Pessoa", color: "#EF4444", parentName: "Direito Penal", sortOrder: 8 },
  { category: "sub_area", name: "Crimes contra o Patrimônio", color: "#EF4444", parentName: "Direito Penal", sortOrder: 9 },
  { category: "sub_area", name: "Crimes de Trânsito", color: "#EF4444", parentName: "Direito Penal", sortOrder: 10 },
  { category: "sub_area", name: "Crimes contra a Administração", color: "#EF4444", parentName: "Direito Penal", sortOrder: 11 },
  { category: "sub_area", name: "Execução Penal", color: "#EF4444", parentName: "Direito Penal", sortOrder: 12 },
  { category: "sub_area", name: "Crimes Digitais", color: "#EF4444", parentName: "Direito Penal", sortOrder: 13 },
  // Direito Trabalhista
  { category: "sub_area", name: "Rescisão Contratual", color: "#F59E0B", parentName: "Direito Trabalhista", sortOrder: 14 },
  { category: "sub_area", name: "Horas Extras", color: "#F59E0B", parentName: "Direito Trabalhista", sortOrder: 15 },
  { category: "sub_area", name: "Assédio Moral/Sexual", color: "#F59E0B", parentName: "Direito Trabalhista", sortOrder: 16 },
  { category: "sub_area", name: "Acidente de Trabalho", color: "#F59E0B", parentName: "Direito Trabalhista", sortOrder: 17 },
  { category: "sub_area", name: "Verbas Rescisórias", color: "#F59E0B", parentName: "Direito Trabalhista", sortOrder: 18 },
  { category: "sub_area", name: "Insalubridade/Periculosidade", color: "#F59E0B", parentName: "Direito Trabalhista", sortOrder: 19 },
  { category: "sub_area", name: "Vínculo Empregatício", color: "#F59E0B", parentName: "Direito Trabalhista", sortOrder: 20 },
  // Direito do Consumidor
  { category: "sub_area", name: "Produto Defeituoso", color: "#10B981", parentName: "Direito do Consumidor", sortOrder: 21 },
  { category: "sub_area", name: "Cobrança Indevida", color: "#10B981", parentName: "Direito do Consumidor", sortOrder: 22 },
  { category: "sub_area", name: "Propaganda Enganosa", color: "#10B981", parentName: "Direito do Consumidor", sortOrder: 23 },
  { category: "sub_area", name: "Negativação Indevida", color: "#10B981", parentName: "Direito do Consumidor", sortOrder: 24 },
  { category: "sub_area", name: "Cancelamento de Serviço", color: "#10B981", parentName: "Direito do Consumidor", sortOrder: 25 },
  { category: "sub_area", name: "Vício do Produto/Serviço", color: "#10B981", parentName: "Direito do Consumidor", sortOrder: 26 },
  { category: "sub_area", name: "Plano de Saúde", color: "#10B981", parentName: "Direito do Consumidor", sortOrder: 27 },
  // Direito de Família
  { category: "sub_area", name: "Divórcio", color: "#EC4899", parentName: "Direito de Família", sortOrder: 28 },
  { category: "sub_area", name: "Guarda de Filhos", color: "#EC4899", parentName: "Direito de Família", sortOrder: 29 },
  { category: "sub_area", name: "Pensão Alimentícia", color: "#EC4899", parentName: "Direito de Família", sortOrder: 30 },
  { category: "sub_area", name: "Partilha de Bens", color: "#EC4899", parentName: "Direito de Família", sortOrder: 31 },
  { category: "sub_area", name: "Adoção", color: "#EC4899", parentName: "Direito de Família", sortOrder: 32 },
  { category: "sub_area", name: "Investigação de Paternidade", color: "#EC4899", parentName: "Direito de Família", sortOrder: 33 },
  { category: "sub_area", name: "União Estável", color: "#EC4899", parentName: "Direito de Família", sortOrder: 34 },
  // Direito Empresarial
  { category: "sub_area", name: "Constituição de Empresa", color: "#8B5CF6", parentName: "Direito Empresarial", sortOrder: 35 },
  { category: "sub_area", name: "Recuperação Judicial", color: "#8B5CF6", parentName: "Direito Empresarial", sortOrder: 36 },
  { category: "sub_area", name: "Falência", color: "#8B5CF6", parentName: "Direito Empresarial", sortOrder: 37 },
  { category: "sub_area", name: "Propriedade Intelectual", color: "#8B5CF6", parentName: "Direito Empresarial", sortOrder: 38 },
  { category: "sub_area", name: "Societário", color: "#8B5CF6", parentName: "Direito Empresarial", sortOrder: 39 },
  { category: "sub_area", name: "Contratos Empresariais", color: "#8B5CF6", parentName: "Direito Empresarial", sortOrder: 40 },
  // Direito Tributário
  { category: "sub_area", name: "Planejamento Tributário", color: "#6366F1", parentName: "Direito Tributário", sortOrder: 41 },
  { category: "sub_area", name: "Execução Fiscal", color: "#6366F1", parentName: "Direito Tributário", sortOrder: 42 },
  { category: "sub_area", name: "Restituição de Tributos", color: "#6366F1", parentName: "Direito Tributário", sortOrder: 43 },
  { category: "sub_area", name: "Auto de Infração", color: "#6366F1", parentName: "Direito Tributário", sortOrder: 44 },
  { category: "sub_area", name: "ICMS/ISS/IPI", color: "#6366F1", parentName: "Direito Tributário", sortOrder: 45 },
  { category: "sub_area", name: "Imposto de Renda", color: "#6366F1", parentName: "Direito Tributário", sortOrder: 46 },
  // Direito Imobiliário
  { category: "sub_area", name: "Compra e Venda", color: "#14B8A6", parentName: "Direito Imobiliário", sortOrder: 47 },
  { category: "sub_area", name: "Locação", color: "#14B8A6", parentName: "Direito Imobiliário", sortOrder: 48 },
  { category: "sub_area", name: "Usucapião", color: "#14B8A6", parentName: "Direito Imobiliário", sortOrder: 49 },
  { category: "sub_area", name: "Condomínio", color: "#14B8A6", parentName: "Direito Imobiliário", sortOrder: 50 },
  { category: "sub_area", name: "Despejo", color: "#14B8A6", parentName: "Direito Imobiliário", sortOrder: 51 },
  { category: "sub_area", name: "Registro de Imóveis", color: "#14B8A6", parentName: "Direito Imobiliário", sortOrder: 52 },
  // Direito Administrativo
  { category: "sub_area", name: "Concurso Público", color: "#64748B", parentName: "Direito Administrativo", sortOrder: 53 },
  { category: "sub_area", name: "Licitação", color: "#64748B", parentName: "Direito Administrativo", sortOrder: 54 },
  { category: "sub_area", name: "Servidor Público", color: "#64748B", parentName: "Direito Administrativo", sortOrder: 55 },
  { category: "sub_area", name: "Desapropriação", color: "#64748B", parentName: "Direito Administrativo", sortOrder: 56 },
  { category: "sub_area", name: "Mandado de Segurança", color: "#64748B", parentName: "Direito Administrativo", sortOrder: 57 },
  { category: "sub_area", name: "Improbidade Administrativa", color: "#64748B", parentName: "Direito Administrativo", sortOrder: 58 },
  // Direito Previdenciário
  { category: "sub_area", name: "Aposentadoria", color: "#0EA5E9", parentName: "Direito Previdenciário", sortOrder: 59 },
  { category: "sub_area", name: "Auxílio-Doença", color: "#0EA5E9", parentName: "Direito Previdenciário", sortOrder: 60 },
  { category: "sub_area", name: "Pensão por Morte", color: "#0EA5E9", parentName: "Direito Previdenciário", sortOrder: 61 },
  { category: "sub_area", name: "BPC/LOAS", color: "#0EA5E9", parentName: "Direito Previdenciário", sortOrder: 62 },
  { category: "sub_area", name: "Revisão de Benefício", color: "#0EA5E9", parentName: "Direito Previdenciário", sortOrder: 63 },
  { category: "sub_area", name: "Aposentadoria Especial", color: "#0EA5E9", parentName: "Direito Previdenciário", sortOrder: 64 },
  { category: "sub_area", name: "Auxílio-Acidente", color: "#0EA5E9", parentName: "Direito Previdenciário", sortOrder: 65 },
  // Direito Ambiental
  { category: "sub_area", name: "Licenciamento Ambiental", color: "#22C55E", parentName: "Direito Ambiental", sortOrder: 66 },
  { category: "sub_area", name: "Crimes Ambientais", color: "#22C55E", parentName: "Direito Ambiental", sortOrder: 67 },
  { category: "sub_area", name: "Recuperação de Áreas", color: "#22C55E", parentName: "Direito Ambiental", sortOrder: 68 },
  { category: "sub_area", name: "Responsabilidade Ambiental", color: "#22C55E", parentName: "Direito Ambiental", sortOrder: 69 },
  // Direito Digital
  { category: "sub_area", name: "LGPD", color: "#A855F7", parentName: "Direito Digital", sortOrder: 70 },
  { category: "sub_area", name: "Crimes Cibernéticos", color: "#A855F7", parentName: "Direito Digital", sortOrder: 71 },
  { category: "sub_area", name: "Direito Autoral Digital", color: "#A855F7", parentName: "Direito Digital", sortOrder: 72 },
  { category: "sub_area", name: "E-commerce", color: "#A855F7", parentName: "Direito Digital", sortOrder: 73 },
  { category: "sub_area", name: "Remoção de Conteúdo", color: "#A855F7", parentName: "Direito Digital", sortOrder: 74 },
  // Direito Internacional
  { category: "sub_area", name: "Comércio Exterior", color: "#06B6D4", parentName: "Direito Internacional", sortOrder: 75 },
  { category: "sub_area", name: "Imigração", color: "#06B6D4", parentName: "Direito Internacional", sortOrder: 76 },
  { category: "sub_area", name: "Arbitragem Internacional", color: "#06B6D4", parentName: "Direito Internacional", sortOrder: 77 },
  { category: "sub_area", name: "Cooperação Jurídica", color: "#06B6D4", parentName: "Direito Internacional", sortOrder: 78 },
  // Direito Constitucional
  { category: "sub_area", name: "Direitos Fundamentais", color: "#F97316", parentName: "Direito Constitucional", sortOrder: 79 },
  { category: "sub_area", name: "Controle de Constitucionalidade", color: "#F97316", parentName: "Direito Constitucional", sortOrder: 80 },
  { category: "sub_area", name: "Habeas Corpus", color: "#F97316", parentName: "Direito Constitucional", sortOrder: 81 },
  { category: "sub_area", name: "Ação Popular", color: "#F97316", parentName: "Direito Constitucional", sortOrder: 82 },
  // Direito Eleitoral
  { category: "sub_area", name: "Registro de Candidatura", color: "#84CC16", parentName: "Direito Eleitoral", sortOrder: 83 },
  { category: "sub_area", name: "Propaganda Eleitoral", color: "#84CC16", parentName: "Direito Eleitoral", sortOrder: 84 },
  { category: "sub_area", name: "Prestação de Contas", color: "#84CC16", parentName: "Direito Eleitoral", sortOrder: 85 },
  { category: "sub_area", name: "Impugnação de Mandato", color: "#84CC16", parentName: "Direito Eleitoral", sortOrder: 86 },
  // Direito Militar
  { category: "sub_area", name: "Processo Administrativo Militar", color: "#78716C", parentName: "Direito Militar", sortOrder: 87 },
  { category: "sub_area", name: "Reforma Militar", color: "#78716C", parentName: "Direito Militar", sortOrder: 88 },
  { category: "sub_area", name: "Crime Militar", color: "#78716C", parentName: "Direito Militar", sortOrder: 89 },
  // Extras: Mais sub-áreas comuns
  { category: "sub_area", name: "Inventário", color: "#3B82F6", parentName: "Direito Civil", sortOrder: 90 },
  { category: "sub_area", name: "Cobrança", color: "#3B82F6", parentName: "Direito Civil", sortOrder: 91 },
  { category: "sub_area", name: "Danos Morais", color: "#3B82F6", parentName: "Direito Civil", sortOrder: 92 },
  { category: "sub_area", name: "Direito do Idoso", color: "#EC4899", parentName: "Direito de Família", sortOrder: 93 },
  { category: "sub_area", name: "Medida Protetiva", color: "#EC4899", parentName: "Direito de Família", sortOrder: 94 },
  { category: "sub_area", name: "Salário-Maternidade", color: "#0EA5E9", parentName: "Direito Previdenciário", sortOrder: 95 },
  { category: "sub_area", name: "FGTS", color: "#F59E0B", parentName: "Direito Trabalhista", sortOrder: 96 },
  { category: "sub_area", name: "Compliance", color: "#8B5CF6", parentName: "Direito Empresarial", sortOrder: 97 },
  { category: "sub_area", name: "Incorporação Imobiliária", color: "#14B8A6", parentName: "Direito Imobiliário", sortOrder: 98 },
];

// ---------------------------------------------------------------------------
// Urgência (4)
// ---------------------------------------------------------------------------

const URGENCIA: PredefinedTag[] = [
  { category: "urgencia", name: "Urgente", color: "#DC2626", sortOrder: 1 },
  { category: "urgencia", name: "Alta", color: "#F97316", sortOrder: 2 },
  { category: "urgencia", name: "Normal", color: "#3B82F6", sortOrder: 3 },
  { category: "urgencia", name: "Baixa", color: "#6B7280", sortOrder: 4 },
];

// ---------------------------------------------------------------------------
// Estágio do Caso (3)
// ---------------------------------------------------------------------------

const ESTAGIO: PredefinedTag[] = [
  { category: "estagio", name: "Consultoria", color: "#8B5CF6", sortOrder: 1 },
  { category: "estagio", name: "Contencioso", color: "#F59E0B", sortOrder: 2 },
  { category: "estagio", name: "Execução", color: "#10B981", sortOrder: 3 },
];

// ---------------------------------------------------------------------------
// Qualidade do Lead (3)
// ---------------------------------------------------------------------------

const QUALIDADE_LEAD: PredefinedTag[] = [
  { category: "qualidade_lead", name: "Quente", color: "#DC2626", sortOrder: 1 },
  { category: "qualidade_lead", name: "Morno", color: "#F59E0B", sortOrder: 2 },
  { category: "qualidade_lead", name: "Frio", color: "#3B82F6", sortOrder: 3 },
];

// ---------------------------------------------------------------------------
// All predefined tags combined
// ---------------------------------------------------------------------------

export const PREDEFINED_TAGS: PredefinedTag[] = [
  ...AREAS_DIREITO,
  ...SUB_AREAS,
  ...URGENCIA,
  ...ESTAGIO,
  ...QUALIDADE_LEAD,
];

export const TAG_CATEGORIES = [
  { value: "area_direito", label: "Áreas do Direito" },
  { value: "sub_area", label: "Sub-áreas" },
  { value: "urgencia", label: "Urgência" },
  { value: "estagio", label: "Estágio do Caso" },
  { value: "qualidade_lead", label: "Qualidade do Lead" },
  { value: "custom", label: "Customizadas" },
] as const;

export type TagCategory = (typeof TAG_CATEGORIES)[number]["value"];
