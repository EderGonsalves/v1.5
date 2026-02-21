// =============================================================================
// Document Templates + Electronic Signature — Central Types
// =============================================================================

// ---------------------------------------------------------------------------
// Baserow Table: document_templates (257)
// ---------------------------------------------------------------------------

export type TemplateType = "html" | "direct_pdf" | "direct_docx";

export type DocumentTemplateRow = {
  id: number;
  name: string;
  description: string;
  category: string; // "contrato" | "procuracao" | "declaracao" | "termo" | "outro"
  institution_id: number;
  created_by_user_id: number;
  file_path: string; // relative to TEMPLATES_STORAGE_DIR
  variables: string; // JSON string: string[]
  is_active: string; // Baserow boolean → "true" | "false"
  template_type: string; // "html" | "direct_pdf" | "direct_docx"
  original_filename: string;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Signer info (used in signers_json)
// ---------------------------------------------------------------------------

export type SignerInfo = {
  name: string;
  phone: string;
  email: string;
  sign_url: string;
  status: string; // "pending" | "sent" | "viewed" | "signed" | "declined"
};

// ---------------------------------------------------------------------------
// Baserow Table: sign_envelopes (256)
// ---------------------------------------------------------------------------

export type SignEnvelopeRow = {
  id: number;
  case_id: number;
  envelope_id: string; // RIA Sign UUID (env_xxx)
  document_id: string; // RIA Sign UUID (doc_xxx)
  template_id: number;
  subject: string;
  status: string; // "draft" | "sent" | "viewed" | "signed" | "completed" | "declined" | "expired"
  signer_name: string; // legacy: primeiro signatário
  signer_phone: string; // legacy: primeiro signatário
  signer_email: string; // legacy: primeiro signatário
  sign_url: string; // legacy: primeiro signatário
  signers_json: string; // JSON string: SignerInfo[]
  signed_at: string;
  institution_id: number;
  created_by_user_id: number;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// RIA Sign API Types
// ---------------------------------------------------------------------------

export type RiaSignEnvelope = {
  id: string;
  status: string;
  subject: string;
  require_otp: boolean;
  use_template: boolean;
  signers: RiaSignSigner[];
  created_at: string;
  expires_at?: string;
};

export type RiaSignSigner = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  cpf?: string;
  status: string;
  sign_url?: string;
  signed_at?: string;
};

export type RiaSignDocument = {
  id: string;
  filename: string;
  original_hash: string;
  page_count: number;
  file_size: number;
  preview_pages: number;
};

export type RiaSignSendResponse = {
  success: boolean;
  status: string;
  signers: Array<{
    id: string;
    name: string;
    phone?: string;
    sign_url: string;
    status: string;
  }>;
};

// ---------------------------------------------------------------------------
// Webhook Event
// ---------------------------------------------------------------------------

export type RiaSignWebhookEvent = {
  event:
    | "envelope.sent"
    | "signer.viewed"
    | "signer.signed"
    | "signer.declined"
    | "signer.otp_requested"
    | "envelope.completed"
    | "envelope.expired";
  envelope_id: string;
  timestamp: string;
  data: {
    signer?: {
      name: string;
      email?: string;
      phone?: string;
      signed_at?: string;
    };
    channel?: string;
  };
};

// ---------------------------------------------------------------------------
// Audit Trail
// ---------------------------------------------------------------------------

export type RiaSignAuditTrail = {
  audit_trail: Array<{
    action: string;
    actor: string;
    entry_hash: string;
    created_at: string;
  }>;
  chain_valid: boolean;
};

// ---------------------------------------------------------------------------
// Variable Context — built from case + client data
// ---------------------------------------------------------------------------

export type DocumentVariableContext = {
  cliente: {
    nome_completo: string;
    cpf: string;
    rg: string;
    email: string;
    celular: string;
    estado_civil: string;
    profissao: string;
    data_nascimento: string;
    nacionalidade: string;
    endereco_rua: string;
    endereco_numero: string;
    endereco_complemento: string;
    endereco_bairro: string;
    endereco_cidade: string;
    endereco_estado: string;
    endereco_completo: string;
  };
  caso: {
    id: string;
    data: string;
    responsavel: string;
    departamento: string;
    valor: string;
  };
  data: {
    hoje: string; // "20 de fevereiro de 2026"
    hoje_iso: string; // "2026-02-20"
    hora_atual: string;
  };
};

// ---------------------------------------------------------------------------
// Available variables for the editor UI
// ---------------------------------------------------------------------------

export const AVAILABLE_VARIABLES: Array<{
  group: string;
  variables: Array<{ key: string; label: string }>;
}> = [
  {
    group: "Cliente",
    variables: [
      { key: "cliente.nome_completo", label: "Nome completo" },
      { key: "cliente.cpf", label: "CPF" },
      { key: "cliente.rg", label: "RG" },
      { key: "cliente.email", label: "Email" },
      { key: "cliente.celular", label: "Celular" },
      { key: "cliente.estado_civil", label: "Estado civil" },
      { key: "cliente.profissao", label: "Profissao" },
      { key: "cliente.nacionalidade", label: "Nacionalidade" },
      { key: "cliente.data_nascimento", label: "Data de nascimento" },
      { key: "cliente.endereco_rua", label: "Rua" },
      { key: "cliente.endereco_numero", label: "Numero" },
      { key: "cliente.endereco_complemento", label: "Complemento" },
      { key: "cliente.endereco_bairro", label: "Bairro" },
      { key: "cliente.endereco_cidade", label: "Cidade" },
      { key: "cliente.endereco_estado", label: "Estado" },
      { key: "cliente.endereco_completo", label: "Endereco completo" },
    ],
  },
  {
    group: "Caso",
    variables: [
      { key: "caso.id", label: "ID do caso" },
      { key: "caso.data", label: "Data do caso" },
      { key: "caso.responsavel", label: "Responsavel" },
      { key: "caso.departamento", label: "Departamento" },
      { key: "caso.valor", label: "Valor" },
    ],
  },
  {
    group: "Data",
    variables: [
      { key: "data.hoje", label: "Data de hoje (extenso)" },
      { key: "data.hoje_iso", label: "Data de hoje (ISO)" },
      { key: "data.hora_atual", label: "Hora atual" },
    ],
  },
];
