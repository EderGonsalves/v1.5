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
  void onChange;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Briefing juridico</h3>
        <Button variant="outline" size="sm" onClick={() => setIsEditing(!isEditing)}>
          {isEditing ? "Visualizar" : "Editar"}
        </Button>
      </div>
      <div className="space-y-3 text-sm">
        <div className="rounded-md bg-muted/40 p-3 space-y-1">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Escopo do briefing
          </p>
          <p className="text-foreground">{data.briefingScope || "-"}</p>
        </div>
        <div className="rounded-md border border-border/40 p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Limite de perguntas
          </p>
          <p className="text-2xl font-semibold text-foreground">
            {data.maxQuestions}
          </p>
        </div>
        <div className="rounded-md border border-border/40 p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Perguntas direcionadas
          </p>
          {data.directedQuestions.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {data.directedQuestions.map((question, index) => (
                <li key={`${question.prompt}-${index}`}>
                  <p className="font-medium">Q{index + 1}: {question.prompt}</p>
                  <p className="text-xs text-muted-foreground">
                    Objetivo: {question.objective}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Sem perguntas cadastradas. O agente gerara perguntas automaticamente com base no nicho informado no perfil.
            </p>
          )}
        </div>
        {data.institutionalAdditionalInfo ? (
          <div className="rounded-md bg-muted/40 p-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Informacoes institucionais adicionais
            </p>
            <p className="mt-1 text-sm text-foreground">
              {data.institutionalAdditionalInfo}
            </p>
          </div>
        ) : null}
      </div>
      {isEditing && (
        <p className="text-xs text-muted-foreground">
          Edicao detalhada do fluxo em breve
        </p>
      )}
    </div>
  );
};








