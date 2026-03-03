"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  INSTRUCTION_DEFINITIONS,
  type InstructionType,
} from "@/lib/agent-instructions";

import { InstructionCard } from "./InstructionCard";
import { AddInstructionButton } from "./AddInstructionButton";

/** Tipos de toggle — sempre renderizados na seção "Funcionalidades" */
const TOGGLE_TYPES: InstructionType[] = [
  "agendamento",
  "assinatura_documentos",
  "acompanhamento_processual",
];

type InstructionListProps = {
  instructions: Map<InstructionType, unknown>;
  onChange: (type: InstructionType, value: unknown) => void;
  onAdd: (type: InstructionType) => void;
  onRemove: (type: InstructionType) => void;
  onSave: () => void;
  onReload: () => void;
  isSaving: boolean;
  isLoading: boolean;
};

export function InstructionList({
  instructions,
  onChange,
  onAdd,
  onRemove,
  onSave,
  onReload,
  isSaving,
  isLoading,
}: InstructionListProps) {
  // Separar cards normais dos toggles
  const normalEntries = Array.from(instructions.entries()).filter(
    ([type]) => !TOGGLE_TYPES.includes(type),
  );
  const toggleEntries = TOGGLE_TYPES.map(
    (type) => [type, instructions.get(type) ?? false] as [InstructionType, unknown],
  );

  const activeTypes = Array.from(instructions.keys());

  return (
    <div className="flex flex-col gap-4">
      {/* Instruções normais */}
      {normalEntries.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-foreground">
            Instruções do agente
          </p>
          {normalEntries.map(([type, value]) => (
            <InstructionCard
              key={type}
              definition={INSTRUCTION_DEFINITIONS[type]}
              value={value}
              onChange={onChange}
              onRemove={onRemove}
              removable
            />
          ))}
        </div>
      )}

      {/* Botão adicionar */}
      <div className="flex items-center gap-3">
        <AddInstructionButton activeTypes={activeTypes} onAdd={onAdd} />
        {normalEntries.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhuma instrução configurada. Adicione instruções para personalizar
            o agente.
          </p>
        )}
      </div>

      {/* Funcionalidades (toggles) */}
      <div className="space-y-3 border-t border-border/40 pt-4">
        <p className="text-sm font-semibold text-foreground">
          Funcionalidades da etapa final
        </p>
        <p className="text-xs text-muted-foreground">
          Ative ou desative funcionalidades que o agente pode oferecer ao
          encerrar o atendimento.
        </p>
        {toggleEntries.map(([type, value]) => (
          <InstructionCard
            key={type}
            definition={INSTRUCTION_DEFINITIONS[type]}
            value={value}
            onChange={onChange}
            onRemove={onRemove}
            removable={false}
          />
        ))}
      </div>

      {/* Botões ação */}
      <div className="flex items-center justify-center gap-4 pt-2">
        <Button
          variant="outline"
          onClick={onReload}
          disabled={isLoading || isSaving}
        >
          Recarregar
        </Button>
        <Button
          onClick={onSave}
          disabled={isSaving}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Salvando...
            </>
          ) : (
            "Salvar Configurações"
          )}
        </Button>
      </div>
    </div>
  );
}
