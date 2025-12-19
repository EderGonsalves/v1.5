"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { useWizard } from "react-use-wizard";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RagFile } from "@/lib/validations";

import { StepActions } from "./StepActions";
import { useOnboarding } from "./onboarding-context";

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

const MAX_SIZE = 15 * 1024 * 1024;

const getExtension = (filename: string) => {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : "";
};

const uploadFile = async (file: File): Promise<RagFile> => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/rag/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Não foi possível enviar o arquivo");
  }

  return response.json();
};

const deleteFile = async (storagePath: string) => {
  await fetch(`/api/rag/upload?rowId=${encodeURIComponent(storagePath)}`, {
    method: "DELETE",
  });
};

type Feedback = {
  type: "success" | "error";
  message: string;
} | null;

export const StepRagUpload = () => {
  const { data, updateSection } = useOnboarding();
  const { nextStep } = useWizard();
  const [isUploading, setIsUploading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const handleSelectFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (!selectedFiles.length) return;

    const validFiles = selectedFiles.filter((file) => {
      const ext = getExtension(file.name);
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        setFeedback({
          type: "error",
          message: `${file.name} possui formato não suportado (${ext}).`,
        });
        return false;
      }
      if (file.size > MAX_SIZE) {
        setFeedback({
          type: "error",
          message: `${file.name} excede o limite de 15MB.`,
        });
        return false;
      }
      return true;
    });

    if (!validFiles.length) return;

    setIsUploading(true);
    try {
      const uploads = [];
      for (const file of validFiles) {
        const result = await uploadFile(file);
        uploads.push(result);
      }

      updateSection({ ragFiles: [...data.ragFiles, ...uploads] });

      setFeedback({
        type: "success",
        message: `${uploads.length} arquivo(s) prontos para gerar embeddings.`,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Falha ao enviar os arquivos.",
      });
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  const handleRemove = async (file: RagFile) => {
    updateSection({
      ragFiles: data.ragFiles.filter((ragFile) => ragFile.storagePath !== file.storagePath),
    });

    try {
      await deleteFile(file.storagePath);
    } catch {
      // Mantem silencio, pois o arquivo pode ter sido limpo manualmente.
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await nextStep();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold">Arquivos de apoio</h3>
          <p className="text-sm text-muted-foreground">
            Envie laudos, contratos, planilhas ou apresentações que o agente possa consultar durante o atendimento. Assim que o cadastro terminar, esses materiais serão enviados para o seu motor de RAG.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 pt-1">
          <Switch
            checked={data.includedSteps.ragUpload}
            onCheckedChange={(checked) => {
              updateSection({
                includedSteps: {
                  ...data.includedSteps,
                  ragUpload: checked,
                },
              });
            }}
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {data.includedSteps.ragUpload ? "Incluído" : "Excluído"}
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-6 text-center hidden">
        <p className="text-sm font-medium text-muted-foreground">Arraste e solte ou selecione os arquivos</p>
        <p className="text-xs text-muted-foreground">Aceitamos PDF, Word, Excel, PowerPoint, ODT, ODS, CSV e imagens (máx. 15MB por arquivo).</p>
        <div className="mt-4 flex justify-center">
          <Button type="button" variant="secondary" disabled={isUploading} asChild>
            <label className="cursor-pointer" htmlFor="rag-upload">
              {isUploading ? "Enviando..." : "Selecionar arquivos"}
            </label>
          </Button>
          <input
            id="rag-upload"
            type="file"
            className="hidden"
            multiple
            onChange={handleSelectFiles}
            accept={ALLOWED_EXTENSIONS.join(",")}
          />
        </div>
      </div>

      {feedback ? (
        <div
          className={`rounded-md border px-3 py-2 text-xs ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-destructive/50 bg-destructive/10 text-destructive"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-muted-foreground">Arquivos enviados</h4>
        {data.ragFiles.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum arquivo adicionado ainda.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.ragFiles.map((file) => (
              <li
                key={file.storagePath}
                className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2"
              >
                <div>
                  <p className="font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {Math.round(file.size / 1024)} KB • {file.mime}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => handleRemove(file)}>
                  Remover
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <StepActions submitLabel="Continuar" isSubmitting={isUploading} />
    </form>
  );
};
