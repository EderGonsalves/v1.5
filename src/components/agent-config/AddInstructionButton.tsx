"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  INSTRUCTION_DEFINITIONS,
  type InstructionType,
} from "@/lib/agent-instructions";

type AddInstructionButtonProps = {
  /** Tipos já adicionados — serão ocultados da lista */
  activeTypes: InstructionType[];
  onAdd: (type: InstructionType) => void;
};

/** Tipos de toggle que são sempre visíveis (não aparecem neste dialog) */
const ALWAYS_VISIBLE: InstructionType[] = [
  "agendamento",
  "assinatura_documentos",
  "acompanhamento_processual",
];

export function AddInstructionButton({
  activeTypes,
  onAdd,
}: AddInstructionButtonProps) {
  const [open, setOpen] = useState(false);

  const available = Object.values(INSTRUCTION_DEFINITIONS).filter(
    (def) =>
      !ALWAYS_VISIBLE.includes(def.type) && !activeTypes.includes(def.type),
  );

  if (available.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-sm">
          <Plus className="h-4 w-4 mr-1.5" />
          Adicionar instrução
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar instrução</DialogTitle>
          <DialogDescription>
            Escolha uma instrução para personalizar o comportamento do agente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1 max-h-[60vh] overflow-y-auto">
          {available.map((def) => (
            <button
              key={def.type}
              type="button"
              className="w-full rounded-md px-3 py-2.5 text-left hover:bg-muted/60 transition-colors"
              onClick={() => {
                onAdd(def.type);
                setOpen(false);
              }}
            >
              <p className="text-sm font-medium text-foreground">{def.label}</p>
              <p className="text-xs text-muted-foreground">{def.description}</p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
