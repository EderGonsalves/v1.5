import { z } from "zod";

// ---------------------------------------------------------------------------
// Template component schemas
// ---------------------------------------------------------------------------

const templateButtonSchema = z.object({
  type: z.enum(["QUICK_REPLY", "PHONE_NUMBER", "URL"]),
  text: z.string().min(1).max(20),
  url: z.string().url().optional(),
  phone_number: z.string().optional(),
});

const templateComponentSchema = z.object({
  type: z.enum(["HEADER", "BODY", "FOOTER", "BUTTONS"]),
  format: z.enum(["TEXT", "IMAGE", "DOCUMENT", "VIDEO"]).optional(),
  text: z.string().optional(),
  buttons: z.array(templateButtonSchema).max(3).optional(),
  example: z
    .object({
      header_handle: z.array(z.string()).optional(),
      header_text: z.array(z.string()).optional(),
      body_text: z.array(z.array(z.string())).optional(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Create template schema
// ---------------------------------------------------------------------------

export const createTemplateSchema = z.object({
  name: z
    .string()
    .min(1, "Nome obrigatório")
    .max(512)
    .regex(
      /^[a-z][a-z0-9_]*$/,
      "Use apenas letras minúsculas, números e underscore (deve começar com letra)",
    ),
  category: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]),
  language: z.string().min(2).max(10).default("pt_BR"),
  components: z
    .array(templateComponentSchema)
    .min(1, "Pelo menos um componente (BODY) é obrigatório"),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

// ---------------------------------------------------------------------------
// Send template schema
// ---------------------------------------------------------------------------

export const sendTemplateSchema = z.object({
  caseId: z.number().int().positive(),
  to: z.string().min(8, "Telefone obrigatório"),
  templateName: z.string().min(1),
  templateLanguage: z.string().min(2).default("pt_BR"),
  components: z
    .array(
      z.object({
        type: z.enum(["header", "body", "button"]),
        parameters: z.array(
          z.object({
            type: z.enum(["text", "image", "document", "video"]).default("text"),
            text: z.string().optional(),
          }),
        ),
      }),
    )
    .optional(),
  wabaPhoneNumber: z.string().min(1, "Número WABA obrigatório"),
});

export type SendTemplateInput = z.infer<typeof sendTemplateSchema>;

// ---------------------------------------------------------------------------
// Shared types (returned by Meta API)
// ---------------------------------------------------------------------------

export type TemplateCategory = "UTILITY" | "MARKETING" | "AUTHENTICATION";
export type TemplateStatus = "PENDING" | "APPROVED" | "REJECTED" | "DISABLED";

export type TemplateButton = {
  type: "QUICK_REPLY" | "PHONE_NUMBER" | "URL";
  text: string;
  url?: string;
  phone_number?: string;
};

export type TemplateComponent = {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "DOCUMENT" | "VIDEO";
  text?: string;
  buttons?: TemplateButton[];
  example?: {
    header_handle?: string[];
    header_text?: string[];
    body_text?: string[][];
  };
};

export type Template = {
  id: string;
  name: string;
  category: TemplateCategory;
  language: string;
  status: TemplateStatus;
  components: TemplateComponent[];
  quality_score?: { score: string };
};
