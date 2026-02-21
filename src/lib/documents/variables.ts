import type { DocumentVariableContext } from "./types";
import type { BaserowCaseRow, ClientRow } from "@/services/api";

// ---------------------------------------------------------------------------
// Extract all {{namespace.field}} variables from HTML content
// ---------------------------------------------------------------------------

export function extractVariables(html: string): string[] {
  const matches = html.matchAll(/\{\{([a-zA-Z_]+\.[a-zA-Z_]+)\}\}/g);
  const vars = new Set<string>();
  for (const m of matches) {
    vars.add(m[1]);
  }
  return Array.from(vars);
}

// ---------------------------------------------------------------------------
// Build variable context from existing case + client data
// ---------------------------------------------------------------------------

export function buildVariableContext(
  caseData: BaserowCaseRow,
  clientData: ClientRow | null,
): DocumentVariableContext {
  const hoje = new Date();
  const meses = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  const hojeFormatado = `${hoje.getDate()} de ${meses[hoje.getMonth()]} de ${hoje.getFullYear()}`;

  // Build address parts
  const enderecoPartes = [
    clientData?.endereco_rua,
    clientData?.endereco_numero
      ? `nº ${clientData.endereco_numero}`
      : undefined,
    clientData?.endereco_complemento,
    clientData?.endereco_bairro,
    clientData?.endereco_cidade,
    clientData?.endereco_estado,
  ].filter(Boolean);

  // Resolve estado_civil from Baserow select field
  let estadoCivil = "";
  if (clientData?.estado_civil) {
    if (typeof clientData.estado_civil === "object" && clientData.estado_civil !== null) {
      estadoCivil = (clientData.estado_civil as { value: string }).value || "";
    } else {
      estadoCivil = String(clientData.estado_civil);
    }
  }

  return {
    cliente: {
      nome_completo:
        clientData?.nome_completo || caseData.CustumerName || "",
      cpf: clientData?.cpf || "",
      rg: clientData?.rg || "",
      email: clientData?.email || "",
      celular: clientData?.celular || caseData.CustumerPhone || "",
      estado_civil: estadoCivil,
      profissao: clientData?.profissao || "",
      data_nascimento: clientData?.data_nascimento || "",
      nacionalidade: clientData?.nacionalidade || "Brasileira",
      endereco_rua: clientData?.endereco_rua || "",
      endereco_numero: clientData?.endereco_numero || "",
      endereco_complemento: clientData?.endereco_complemento || "",
      endereco_bairro: clientData?.endereco_bairro || "",
      endereco_cidade: clientData?.endereco_cidade || "",
      endereco_estado: clientData?.endereco_estado || "",
      endereco_completo: enderecoPartes.join(", "),
    },
    caso: {
      id: String(caseData.id),
      data: caseData.Data || caseData.data || "",
      responsavel: caseData.responsavel || "",
      departamento: caseData.department_name || "",
      valor:
        caseData.valor != null
          ? Number(caseData.valor).toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })
          : "",
    },
    data: {
      hoje: hojeFormatado,
      hoje_iso: hoje.toISOString().slice(0, 10),
      hora_atual: hoje.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Interpolate variables into HTML — replaces {{cliente.nome_completo}} etc.
// ---------------------------------------------------------------------------

export function interpolateVariables(
  html: string,
  context: DocumentVariableContext,
): string {
  return html.replace(
    /\{\{([a-zA-Z_]+)\.([a-zA-Z_]+)\}\}/g,
    (match, ns: string, field: string) => {
      const namespace = (
        context as Record<string, Record<string, string>>
      )[ns];
      if (namespace && typeof namespace[field] === "string") {
        return namespace[field];
      }
      return match; // leave unreplaced if not found
    },
  );
}
