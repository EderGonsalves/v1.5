import { z } from "zod";

// ---------------------------------------------------------------------------
// Template schemas
// ---------------------------------------------------------------------------

export const createTemplateSchema = z.object({
  name: z.string().min(1, "Nome obrigatório").max(200),
  description: z.string().max(500).optional().default(""),
  category: z.enum(["contrato", "procuracao", "declaracao", "termo", "outro"]),
  html_content: z.string().min(10, "Conteúdo HTML obrigatório"),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  category: z
    .enum(["contrato", "procuracao", "declaracao", "termo", "outro"])
    .optional(),
  html_content: z.string().min(10).optional(),
});

export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const uploadTemplateSchema = z.object({
  name: z.string().min(1, "Nome obrigatório").max(200),
  description: z.string().max(500).optional().default(""),
  category: z.enum(["contrato", "procuracao", "declaracao", "termo", "outro"]),
  mode: z.enum(["editable", "direct"]),
});

export type UploadTemplateInput = z.infer<typeof uploadTemplateSchema>;

// ---------------------------------------------------------------------------
// Envelope schemas
// ---------------------------------------------------------------------------

const signerSchema = z.object({
  name: z.string().min(1, "Nome do signatário obrigatório"),
  phone: z.string().min(10, "Telefone obrigatório"),
  email: z.string().email("Email inválido").optional().default(""),
});

export const createEnvelopeSchema = z.object({
  caseId: z.number().int().positive("ID do caso obrigatório"),
  templateId: z.number().int().positive("ID do template obrigatório"),
  subject: z.string().min(1, "Assunto obrigatório").max(200),
  htmlContent: z.string().min(10).optional(), // optional for direct uploads
  signers: z.array(signerSchema).min(1, "Pelo menos um signatário"),
  templateType: z.string().optional(), // "html" | "direct_pdf" | "direct_docx"
  waba_config_id: z.string().optional(), // WABA Phone ID selecionado pelo SysAdmin
  require_otp: z.boolean().optional(),
  require_selfie: z.boolean().optional(),
});

export type CreateEnvelopeInput = z.infer<typeof createEnvelopeSchema>;
