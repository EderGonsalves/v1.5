"use client";

import { X, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type {
  InstructionType,
  InstructionDefinition,
  ToggleValue,
} from "@/lib/agent-instructions";

type InstructionCardProps = {
  definition: InstructionDefinition;
  value: unknown;
  onChange: (type: InstructionType, value: unknown) => void;
  onRemove: (type: InstructionType) => void;
  /** Toggles não podem ser removidos */
  removable?: boolean;
};

export function InstructionCard({
  definition,
  value,
  onChange,
  onRemove,
  removable = true,
}: InstructionCardProps) {
  const { type, label, description, fieldType, placeholder } = definition;

  const renderField = () => {
    switch (fieldType) {
      case "text":
        return (
          <Input
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(type, e.target.value)}
            placeholder={placeholder}
            className="text-sm"
          />
        );

      case "textarea":
        return (
          <Textarea
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(type, e.target.value)}
            placeholder={placeholder}
            className="text-sm min-h-[80px]"
            rows={3}
          />
        );

      case "number":
        return (
          <Input
            type="number"
            min={1}
            max={20}
            value={typeof value === "number" ? value : 5}
            onChange={(e) => onChange(type, Number(e.target.value) || 1)}
            className="text-sm w-24"
          />
        );

      case "toggle": {
        const tv = (value && typeof value === "object" && "enabled" in (value as object))
          ? (value as ToggleValue)
          : { enabled: value === true, instructions: "" };
        return (
          <Switch
            checked={tv.enabled}
            onCheckedChange={(checked) =>
              onChange(type, { ...tv, enabled: checked } as ToggleValue)
            }
          />
        );
      }

      case "list":
        return <QuestionList value={value} type={type} onChange={onChange} placeholder={placeholder} />;

      default:
        return null;
    }
  };

  if (fieldType === "toggle") {
    const tv = (value && typeof value === "object" && "enabled" in (value as object))
      ? (value as ToggleValue)
      : { enabled: value === true, instructions: "" };
    return (
      <div className="rounded-md border border-border/50 bg-muted/30 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0 mr-3">
            <p className="text-sm font-medium text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          {renderField()}
        </div>
        {tv.enabled && (
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">
              Instruções para o agente
            </Label>
            <Textarea
              value={tv.instructions}
              onChange={(e) =>
                onChange(type, { ...tv, instructions: e.target.value } as ToggleValue)
              }
              placeholder={placeholder}
              className="text-sm min-h-[60px]"
              rows={2}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border/50 bg-card p-4 space-y-2">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <Label className="text-sm font-semibold text-foreground">
            {label}
          </Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {removable && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(type)}
            title="Remover instrução"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {renderField()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente: lista de perguntas
// ---------------------------------------------------------------------------

function QuestionList({
  value,
  type,
  onChange,
  placeholder,
}: {
  value: unknown;
  type: InstructionType;
  onChange: (type: InstructionType, value: unknown) => void;
  placeholder?: string;
}) {
  const questions: string[] = Array.isArray(value) ? (value as string[]) : [];

  const updateQuestion = (index: number, text: string) => {
    const next = [...questions];
    next[index] = text;
    onChange(type, next);
  };

  const addQuestion = () => {
    onChange(type, [...questions, ""]);
  };

  const removeQuestion = (index: number) => {
    onChange(
      type,
      questions.filter((_, i) => i !== index),
    );
  };

  return (
    <div className="space-y-2">
      {questions.map((q, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-6 shrink-0">
            {i + 1}.
          </span>
          <Input
            value={q}
            onChange={(e) => updateQuestion(i, e.target.value)}
            placeholder={placeholder}
            className="text-sm flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive shrink-0"
            onClick={() => removeQuestion(i)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      {questions.length < 20 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={addQuestion}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Adicionar pergunta
        </Button>
      )}
    </div>
  );
}
