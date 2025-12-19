"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { AgentFlow } from "@/lib/validations";

type AgentFlowSectionProps = {
  data: AgentFlow;
  onChange: (data: AgentFlow) => void;
};

export const AgentFlowSection = ({
  data,
  onChange,
}: AgentFlowSectionProps) => {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Fluxo Operacional</h3>
        <Button variant="outline" size="sm" onClick={() => setIsEditing(!isEditing)}>
          {isEditing ? "Visualizar" : "Editar"}
        </Button>
      </div>
      <div className="space-y-3 text-sm">
        <div className="rounded-md bg-muted/40 p-3 space-y-2">
          <p>
            <span className="font-medium">Recepção:</span> {data.greetingsScript}
          </p>
          <p>
            <span className="font-medium">Produtos:</span> {data.companyOfferings}
          </p>
          <p>
            <span className="font-medium">Qualificação:</span> {data.qualificationPrompt}
          </p>
          <p>
            <span className="font-medium">Fallback:</span> {data.qualificationFallback}
          </p>
          <p>
            <span className="font-medium">Desqualificação:</span> {data.disqualificationRules}
          </p>
          <p>
            <span className="font-medium">Compromisso:</span>{" "}
            {data.commitmentType === "contrato" ? "Assinatura digital" : "Agendamento"} - {data.commitmentScript}
          </p>
          <p>
            <span className="font-medium">Confirmação de documentos:</span> {data.documentConfirmationMessage}
          </p>
          <p>
            <span className="font-medium">Encerramento:</span> {data.closingMessage}
          </p>
          <p>
            <span className="font-medium">Follow-up:</span> {data.followUpRules}
          </p>
        </div>
        <div className="rounded-md border border-border/40 p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Perguntas de viabilidade
          </p>
          <ul className="mt-2 space-y-2">
            {data.viabilityQuestions.map((question, index) => (
              <li key={`${question.prompt}-${index}`}>
                <p className="font-medium">Q{index + 1}: {question.prompt}</p>
                <p className="text-xs text-muted-foreground">
                  Objetivo: {question.objective}
                </p>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-md border border-border/40 p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Checklist de documentos
          </p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            {data.documentsChecklist.map((doc, index) => (
              <li key={`${doc}-${index}`}>{doc}</li>
            ))}
          </ul>
        </div>
      </div>
      {isEditing && (
        <p className="text-xs text-muted-foreground">
          Edição detalhada do fluxo em breve
        </p>
      )}
    </div>
  );
};








