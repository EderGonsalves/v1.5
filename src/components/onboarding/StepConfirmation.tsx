"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWizard } from "react-use-wizard";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { buildOnboardingPayload } from "@/lib/validations";
import { submitOnboarding } from "@/services/api";

import { useOnboarding } from "./onboarding-context";

export const StepConfirmation = () => {
  const { data, reset } = useOnboarding();
  const { previousStep, goToStep, nextStep } = useWizard();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      console.log("Enviando dados do onboarding:", data);
      const payload = buildOnboardingPayload(data);
      console.log("Payload construído:", payload);
      const response = await submitOnboarding(payload);
      console.log("Resposta do servidor:", response.data);
      setStatus("success");
      
      // Avançar para a próxima etapa (Conexões) após 2 segundos
      setTimeout(async () => {
        await nextStep();
      }, 2000);
    } catch (error) {
      console.error("Erro ao enviar onboarding:", error);
      setStatus("error");
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else if (typeof error === "object" && error !== null && "response" in error) {
        const axiosError = error as { response?: { data?: { message?: string } } };
        setErrorMessage(
          axiosError.response?.data?.message || "Não foi possível registrar o onboarding"
        );
      } else {
        setErrorMessage("Não foi possível registrar o onboarding");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestart = () => {
    reset();
    goToStep(0);
    setStatus("idle");
    setErrorMessage("");
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Revise e finalize</h3>
        <p className="text-sm text-muted-foreground">
          Verifique se as informações estão corretas antes de enviar tudo ao seu fluxo automatizado.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-border/60 p-4">
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground">Empresa</h4>
          <p className="text-base font-medium">{data.companyInfo.companyName || "-"}</p>
          <p className="text-sm text-muted-foreground">
            Atendimento: {data.companyInfo.businessHours || "-"}
          </p>
          <p className="text-sm text-muted-foreground">
            Telefone conectado à API: {data.companyInfo.phoneNumber || "-"}
          </p>
        </div>

        <Separator />

        <div>
          <h4 className="text-sm font-semibold text-muted-foreground">Endereço</h4>
          <p className="text-sm">{data.address.street || "-"}</p>
          <p className="text-sm text-muted-foreground">
            {data.address.city || "-"} / {data.address.state || "-"} - CEP {data.address.zipCode || "-"}
          </p>
        </div>

        <Separator />

        <div>
          <h4 className="text-sm font-semibold text-muted-foreground">Agente orquestrador</h4>
          <p className="text-sm text-muted-foreground">
            Nome: <span className="font-medium text-foreground">{data.agentProfile.agentName || "-"}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Idioma: {data.agentProfile.language || "-"}
          </p>
          <p className="text-sm text-muted-foreground">Descrição:</p>
          <p className="rounded-md bg-muted/40 p-2 text-sm">
            {data.agentProfile.personalityDescription || "-"}
          </p>
          <p className="text-sm text-muted-foreground">Área de expertise:</p>
          <p className="rounded-md bg-muted/40 p-2 text-sm">
            {data.agentProfile.expertiseArea || "-"}
          </p>
        </div>

        <Separator />

        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground">Fluxo por agentes</h4>
          {data.agentStages.map((stage) => (
            <div key={stage.stage} className="rounded-md border border-border/40 p-3 text-sm">
              <p className="font-medium text-foreground">{stage.stage}</p>
              <p className="text-xs text-muted-foreground">Responsável: {stage.agent}</p>
              <p className="text-xs text-muted-foreground mt-1">Missão: {stage.mission}</p>
              <p className="text-xs text-muted-foreground mt-1">Roteiro: {stage.script}</p>
            </div>
          ))}
        </div>

        <Separator />

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-muted-foreground">Fluxo operacional comum</h4>
          <div className="rounded-md bg-muted/40 p-3 text-sm space-y-2">
            <p><span className="font-medium">Recepção:</span> {data.agentFlow.greetingsScript}</p>
            <p><span className="font-medium">Produtos:</span> {data.agentFlow.companyOfferings}</p>
            <p><span className="font-medium">Qualificação:</span> {data.agentFlow.qualificationPrompt}</p>
            <p><span className="font-medium">Fallback:</span> {data.agentFlow.qualificationFallback}</p>
            <p><span className="font-medium">Desqualificação:</span> {data.agentFlow.disqualificationRules}</p>
            <p><span className="font-medium">Compromisso:</span> {data.agentFlow.commitmentType === "contrato" ? "Assinatura digital" : "Agendamento"} - {data.agentFlow.commitmentScript}</p>
            <p><span className="font-medium">Confirmação de documentos:</span> {data.agentFlow.documentConfirmationMessage}</p>
            <p><span className="font-medium">Encerramento:</span> {data.agentFlow.closingMessage}</p>
            <p><span className="font-medium">Follow-up:</span> {data.agentFlow.followUpRules}</p>
          </div>

          {data.agentFlow.skippableStages && data.agentFlow.skippableStages.length > 0 && (
            <div className="rounded-md border border-border/40 p-3 text-sm">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Etapas que podem ser puladas</p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                {data.agentFlow.skippableStages.map((stage, index) => (
                  <li key={`${stage}-${index}`}>{stage}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-md border border-border/40 p-3 text-sm">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Perguntas de viabilidade</p>
            <ul className="mt-2 space-y-2">
              {data.agentFlow.viabilityQuestions.map((question, index) => (
                <li key={`${question.prompt}-${index}`}>
                  <p className="font-medium">Q{index + 1}: {question.prompt}</p>
                  <p className="text-xs text-muted-foreground">Objetivo: {question.objective}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-md border border-border/40 p-3 text-sm">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Checklist de documentos</p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              {data.agentFlow.documentsChecklist.map((doc, index) => (
                <li key={`${doc}-${index}`}>{doc}</li>
              ))}
            </ul>
          </div>
        </div>

        <Separator />

        <div>
          <h4 className="text-sm font-semibold text-muted-foreground">Mensagem base</h4>
          <p className="text-sm text-muted-foreground">Saudação inicial:</p>
          <p className="rounded-md bg-muted/40 p-2 text-sm">
            {data.agentPersonality.greeting || "-"}
          </p>
          <p className="text-sm text-muted-foreground">Despedida:</p>
          <p className="rounded-md bg-muted/40 p-2 text-sm">
            {data.agentPersonality.closing || "-"}
          </p>
          <p className="text-sm text-muted-foreground">
            Palavras proibidas: {data.agentPersonality.forbiddenWords.length > 0 ? data.agentPersonality.forbiddenWords.join(", ") : "-"}
          </p>
        </div>

        <Separator />

        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground">Arquivos RAG</h4>
          {data.ragFiles.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum arquivo enviado. Ainda é possível concluir o onboarding.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.ragFiles.map((file) => (
                <li key={file.storagePath} className="rounded-md border border-border/40 p-3">
                  <p className="font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{file.mime} • {Math.round(file.size / 1024)} KB</p>
                  <p className="text-xs text-muted-foreground break-all">URL temporaria: {file.tempUrl}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {status === "success" ? (
        <div className="rounded-md border border-green-300 bg-green-50 p-4 text-sm text-green-900">
          Tudo certo! Compartilhamos o fluxo configurado e os arquivos de apoio com a sua automação e avisamos o worker de RAG.
        </div>
      ) : null}

      {status === "error" ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Houve uma falha ao comunicar com o backend. {errorMessage}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={previousStep}
          disabled={isSubmitting}
        >
          Voltar e editar
        </Button>

        <div className="flex flex-col gap-2 sm:flex-row">
          {status === "success" ? (
            <Button type="button" variant="secondary" onClick={handleRestart}>
              Novo onboarding
            </Button>
          ) : null}

          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Enviando..." : "Finalizar cadastro"}
          </Button>
        </div>
      </div>
    </div>
  );
};
