"use client";

import { useState } from "react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import type { OnboardingData } from "@/lib/validations";
import { CompanyInfoSection } from "./sections/CompanyInfoSection";
import { AddressSection } from "./sections/AddressSection";
import { AgentProfileSection } from "./sections/AgentProfileSection";
import { AgentStagesSection } from "./sections/AgentStagesSection";
import { AgentPersonalitySection } from "./sections/AgentPersonalitySection";
import { AgentFlowSection } from "./sections/AgentFlowSection";
import { ConnectionsSection } from "./sections/ConnectionsSection";

type DashboardContentProps = {
  config: OnboardingData;
  onSave: (config: OnboardingData) => Promise<void>;
  isSaving: boolean;
};

export const DashboardContent = ({
  config,
  onSave,
  isSaving,
}: DashboardContentProps) => {
  const [localConfig, setLocalConfig] = useState<OnboardingData>(config);
  const [hasChanges, setHasChanges] = useState(false);

  const updateConfig = (updates: Partial<OnboardingData>) => {
    setLocalConfig((prev) => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      await onSave(localConfig);
      setHasChanges(false);
    } catch (error) {
      console.error("Erro ao salvar:", error);
      throw error;
    }
  };

  return (
    <div className="space-y-6">
      <CompanyInfoSection
        data={localConfig.companyInfo}
        onChange={(data) => updateConfig({ companyInfo: data })}
      />

      <Separator />

      <AddressSection
        data={localConfig.address}
        onChange={(data) => updateConfig({ address: data })}
      />

      <Separator />

      <AgentProfileSection
        data={localConfig.agentProfile}
        onChange={(data) => updateConfig({ agentProfile: data })}
      />

      <Separator />

      <AgentStagesSection
        data={localConfig.agentStages}
        onChange={(data) => updateConfig({ agentStages: data })}
      />

      <Separator />

      <AgentPersonalitySection
        data={localConfig.agentPersonality}
        onChange={(data) => updateConfig({ agentPersonality: data })}
      />

      <Separator />

      <AgentFlowSection
        data={localConfig.agentFlow}
        onChange={(data) => updateConfig({ agentFlow: data })}
      />

      <Separator />

      <ConnectionsSection
        data={localConfig.connections}
        institutionId={localConfig.auth?.institutionId}
        onChange={(data) => updateConfig({ connections: data })}
      />

      {hasChanges && (
        <div className="sticky bottom-0 rounded-lg border border-border bg-background p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Você tem alterações não salvas
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setLocalConfig(config);
                  setHasChanges(false);
                }}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Salvando..." : "Salvar alterações"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};








