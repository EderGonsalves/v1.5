"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { AgentStage } from "@/lib/validations";

type AgentStagesSectionProps = {
  data: AgentStage[];
  onChange: (data: AgentStage[]) => void;
};

export const AgentStagesSection = ({
  data,
  onChange,
}: AgentStagesSectionProps) => {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Etapas do Fluxo</h3>
        <Button variant="outline" size="sm" onClick={() => setIsEditing(!isEditing)}>
          {isEditing ? "Visualizar" : "Editar"}
        </Button>
      </div>
      <div className="space-y-3">
        {data.map((stage, index) => (
          <div
            key={`${stage.stage}-${index}`}
            className="rounded-md border border-border/40 p-3 text-sm"
          >
            <p className="font-medium text-foreground">{stage.stage}</p>
            <p className="text-xs text-muted-foreground">
              Responsável: {stage.agent}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Missão: {stage.mission}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Roteiro: {stage.script}
            </p>
          </div>
        ))}
      </div>
      {isEditing && (
        <p className="text-xs text-muted-foreground">
          Edição detalhada das etapas em breve
        </p>
      )}
    </div>
  );
};








