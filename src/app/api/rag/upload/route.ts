import { NextRequest, NextResponse } from "next/server";
import path from "node:path";

import { getRequestAuth } from "@/lib/auth/session";

const MAX_SIZE = 15 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
  ".ppt",
  ".pptx",
  ".odt",
  ".ods",
  ".png",
  ".jpg",
  ".jpeg",
];

type AutomationDbConfig = {
  baseUrl: string;
  token: string;
  tableId: string;
  fileFieldName: string;
};

type AutomationDbFile = {
  size: number;
  mime_type: string;
  is_image: boolean;
  image_width: number | null;
  image_height: number | null;
  uploaded_at: string;
  url: string;
  thumbnails: unknown;
  name: string;
  original_name?: string;
  visible_name?: string;
};

type AutomationDbRowResponse = {
  id: number;
  order: string;
  [key: string]: unknown;
};

const getAutomationDbConfig = (): AutomationDbConfig => {
  const baseUrl =
    process.env.AUTOMATION_DB_API_URL?.replace(/\/+$/, "") ??
    "https://automation-db.riasistemas.com.br/api";
  const token = process.env.AUTOMATION_DB_TOKEN;
  const tableId = process.env.AUTOMATION_DB_TABLE_ID;
  const fileFieldName = process.env.AUTOMATION_DB_FILE_FIELD || "arquivo";

  if (!token || !tableId) {
    throw new Error("Automation DB credentials are not configured");
  }

  return { baseUrl, token, tableId, fileFieldName };
};

export async function POST(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let automationDbConfig: AutomationDbConfig;

  try {
    automationDbConfig = getAutomationDbConfig();
  } catch {
    return NextResponse.json(
      {
        error: "automation_db_not_configured",
        message: "Verifique as variáveis AUTOMATION_DB_* no ambiente.",
      },
      { status: 500 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "file_missing" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  }

  const extension = path.extname(file.name).toLowerCase();
  if (extension && !ALLOWED_EXTENSIONS.includes(extension)) {
    return NextResponse.json({ error: "unsupported_extension" }, { status: 400 });
  }

  const uploadFormData = new FormData();
  uploadFormData.append("file", file, file.name);

  const uploadResponse = await fetch(`${automationDbConfig.baseUrl}/user-files/upload-file/`, {
    method: "POST",
    headers: {
      Authorization: `Token ${automationDbConfig.token}`,
    },
    body: uploadFormData,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text().catch(() => "upload_failed");
    return NextResponse.json(
      { error: "automation_db_upload_failed", message: errorText },
      { status: 502 },
    );
  }

  const uploadedFile = (await uploadResponse.json()) as AutomationDbFile;
  const rowPayload = {
    [automationDbConfig.fileFieldName]: [
      {
        ...uploadedFile,
        original_name: uploadedFile.original_name ?? file.name,
        visible_name: file.name,
      },
    ],
  };

  const rowResponse = await fetch(
    `${automationDbConfig.baseUrl}/database/rows/table/${automationDbConfig.tableId}/?user_field_names=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${automationDbConfig.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(rowPayload),
    },
  );

  if (!rowResponse.ok) {
    const errorText = await rowResponse.text().catch(() => "row_creation_failed");
    return NextResponse.json(
      { error: "automation_db_row_failed", message: errorText },
      { status: 502 },
    );
  }

  const createdRow = (await rowResponse.json()) as AutomationDbRowResponse;
  const storedFiles = createdRow[automationDbConfig.fileFieldName];
  const savedFile =
    Array.isArray(storedFiles) && storedFiles.length > 0 ? (storedFiles[0] as AutomationDbFile) : null;

  if (!savedFile) {
    return NextResponse.json(
      { error: "automation_db_invalid_response", message: "Arquivo não retornado pelo Automation DB." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    name: savedFile.visible_name ?? file.name,
    mime: savedFile.mime_type || file.type || "application/octet-stream",
    size: savedFile.size ?? file.size,
    storagePath: String(createdRow.id),
    tempUrl: savedFile.url ?? uploadedFile.url,
  });
}

export async function DELETE(request: NextRequest) {
  const auth = getRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let automationDbConfig: AutomationDbConfig;

  try {
    automationDbConfig = getAutomationDbConfig();
  } catch {
    return NextResponse.json(
      {
        error: "automation_db_not_configured",
        message: "Verifique as variáveis AUTOMATION_DB_* no ambiente.",
      },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const rowIdParam = searchParams.get("rowId") ?? searchParams.get("path");

  if (!rowIdParam) {
    return NextResponse.json({ error: "row_id_missing" }, { status: 400 });
  }

  const numericRowId = Number(rowIdParam);

  if (!Number.isInteger(numericRowId) || numericRowId <= 0) {
    return NextResponse.json({ error: "invalid_row_id" }, { status: 400 });
  }

  const deleteResponse = await fetch(
    `${automationDbConfig.baseUrl}/database/rows/table/${automationDbConfig.tableId}/${numericRowId}/`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Token ${automationDbConfig.token}`,
      },
    },
  );

  if (!deleteResponse.ok) {
    const errorText = await deleteResponse.text().catch(() => "delete_failed");
    return NextResponse.json(
      {
        error: "delete_failed",
        message: errorText,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
