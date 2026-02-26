import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/auth/session";
import { getEnvelope } from "@/services/riasign";
import {
  getEnvelopeById,
  updateEnvelopeRecord,
} from "@/services/sign-envelopes";

type RouteContext = {
  params: Promise<{ envelopeId: string }>;
};

// GET /api/v1/sign/[envelopeId] — get envelope details
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = getRequestAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { envelopeId } = await context.params;
  const id = Number(envelopeId);
  if (!id)
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  try {
    const record = await getEnvelopeById(id);
    if (!record)
      return NextResponse.json(
        { error: "Envelope não encontrado" },
        { status: 404 },
      );

    // Permitir acesso se: SysAdmin (4), mesma instituição, ou registro sem institution_id (legado)
    const recordInstId = Number(record.institution_id) || 0;
    if (
      auth.institutionId !== 4 &&
      recordInstId !== 0 &&
      recordInstId !== auth.institutionId
    ) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    return NextResponse.json(record);
  } catch (err) {
    console.error("[sign] GET/:id error:", err);
    return NextResponse.json(
      { error: "Erro ao buscar envelope" },
      { status: 500 },
    );
  }
}

// PATCH /api/v1/sign/[envelopeId] — refresh status from RIA Sign API
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = getRequestAuth(request);
  if (!auth)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { envelopeId } = await context.params;
  const id = Number(envelopeId);
  if (!id)
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  try {
    const record = await getEnvelopeById(id);
    if (!record)
      return NextResponse.json(
        { error: "Envelope não encontrado" },
        { status: 404 },
      );

    // Fetch current status from RIA Sign
    const riaEnvelope = await getEnvelope(record.envelope_id);

    console.log(
      "[sign] PATCH refresh — RIA Sign response:",
      JSON.stringify({
        status: riaEnvelope.status,
        signers: riaEnvelope.signers?.map((s) => ({
          name: s.name,
          phone: s.phone,
          status: s.status,
          sign_url: s.sign_url ?? "(vazio)",
        })),
      }),
    );

    const newStatus = riaEnvelope.status || record.status;

    // Find first signer signed_at
    const firstRiaSigner = riaEnvelope.signers?.[0];
    const signerSignedAt = firstRiaSigner?.signed_at || "";

    const updates: Record<string, unknown> = {
      status: newStatus,
      ...(signerSignedAt ? { signed_at: signerSignedAt } : {}),
    };

    // Atualizar sign_url legacy com o primeiro signatário
    if (firstRiaSigner?.sign_url && !record.sign_url) {
      updates.sign_url = firstRiaSigner.sign_url;
    }

    // Construir/atualizar signers_json a partir da resposta da RIA Sign
    if (riaEnvelope.signers?.length) {
      let localSigners: Array<{
        name: string; phone: string; email: string; sign_url: string; status: string;
      }>;

      // Tentar usar signers_json existente como base
      if (record.signers_json) {
        try {
          localSigners = JSON.parse(record.signers_json);
        } catch {
          localSigners = [];
        }
      } else {
        // Envelopes antigos sem signers_json — construir a partir dos campos legacy
        localSigners = [{
          name: record.signer_name || "",
          phone: record.signer_phone || "",
          email: record.signer_email || "",
          sign_url: record.sign_url || "",
          status: record.status || "sent",
        }];
      }

      // Sincronizar com dados da RIA Sign
      for (const riaSigner of riaEnvelope.signers) {
        const idx = localSigners.findIndex(
          (s) =>
            s.name.toLowerCase() === riaSigner.name?.toLowerCase() ||
            (riaSigner.phone && s.phone === riaSigner.phone),
        );
        if (idx >= 0) {
          localSigners[idx].status = riaSigner.status || localSigners[idx].status;
          if (riaSigner.sign_url) {
            localSigners[idx].sign_url = riaSigner.sign_url;
          }
        } else {
          // Signatário novo (não encontrado localmente) — adicionar
          localSigners.push({
            name: riaSigner.name || "",
            phone: riaSigner.phone || "",
            email: "",
            sign_url: riaSigner.sign_url || "",
            status: riaSigner.status || "sent",
          });
        }
      }

      updates.signers_json = JSON.stringify(localSigners);

      // Atualizar sign_url legacy com primeiro que tiver URL
      const firstWithUrl = localSigners.find((s) => s.sign_url);
      if (firstWithUrl && !record.sign_url) {
        updates.sign_url = firstWithUrl.sign_url;
      }
    }

    console.log("[sign] PATCH updates:", JSON.stringify(updates));

    const updated = await updateEnvelopeRecord(id, updates);

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[sign] PATCH/:id error:", err);
    return NextResponse.json(
      { error: "Erro ao atualizar status" },
      { status: 500 },
    );
  }
}
