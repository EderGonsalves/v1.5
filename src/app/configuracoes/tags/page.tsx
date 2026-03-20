"use client";

import { useState, useMemo } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { useTags } from "@/hooks/use-tags";
import { TAG_CATEGORIES } from "@/lib/tags/predefined-tags";
import type { TagPublicRow } from "@/services/tags";

const COLOR_PRESETS = [
  "#3B82F6", "#EF4444", "#F59E0B", "#10B981", "#EC4899",
  "#8B5CF6", "#6366F1", "#14B8A6", "#64748B", "#0EA5E9",
  "#22C55E", "#A855F7", "#06B6D4", "#F97316", "#84CC16",
  "#78716C", "#DC2626", "#6B7280",
];

function TagBadge({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full text-white"
      style={{ backgroundColor: color }}
    >
      {name}
    </span>
  );
}

function TagToggleCard({
  tag,
  onToggle,
  isUpdating,
}: {
  tag: TagPublicRow;
  onToggle: (tagId: number, isActive: boolean) => void;
  isUpdating: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
      <div className="flex items-center gap-2.5 min-w-0">
        <TagBadge name={tag.name} color={tag.color} />
      </div>
      <Switch
        checked={tag.isActive}
        onCheckedChange={(checked) => onToggle(tag.id, checked)}
        disabled={isUpdating}
      />
    </div>
  );
}

function CustomTagDialog({
  open,
  onOpenChange,
  onSave,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: { name: string; description: string; color: string; aiCriteria: string }) => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#3B82F6");
  const [aiCriteria, setAiCriteria] = useState("");

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), description, color, aiCriteria });
    setName("");
    setDescription("");
    setColor("#3B82F6");
    setAiCriteria("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Tag Customizada</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-sm">Nome</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome da tag"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Descrição (opcional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição da tag"
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Cor</Label>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="w-7 h-7 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? "#000" : "transparent",
                    transform: color === c ? "scale(1.2)" : "scale(1)",
                  }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#RRGGBB"
                className="w-28"
              />
              <TagBadge name={name || "Preview"} color={color} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Critérios IA (opcional)</Label>
            <Textarea
              value={aiCriteria}
              onChange={(e) => setAiCriteria(e.target.value)}
              placeholder="Critérios para classificação automática por IA"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!name.trim() || isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Criar Tag
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function TagsSettingsPage() {
  const { data } = useOnboarding();
  const institutionId = data.auth?.institutionId;
  const { tags, isLoading, error, updateTag, createTag, deleteTag, isTagUpdating } = useTags(institutionId);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<string>("");

  // Group tags by category
  const tagsByCategory = useMemo(() => {
    const map = new Map<string, TagPublicRow[]>();
    for (const tag of tags) {
      const list = map.get(tag.category) ?? [];
      list.push(tag);
      map.set(tag.category, list);
    }
    // Sort each category by sortOrder
    for (const [key, list] of map) {
      map.set(key, list.sort((a, b) => a.sortOrder - b.sortOrder));
    }
    return map;
  }, [tags]);

  // Areas for sub-area filter
  const areas = useMemo(() => {
    return (tagsByCategory.get("area_direito") ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [tagsByCategory]);

  // Filtered sub-areas
  const filteredSubAreas = useMemo(() => {
    const subAreas = tagsByCategory.get("sub_area") ?? [];
    if (!selectedAreaFilter) return subAreas;
    const parentId = Number(selectedAreaFilter);
    return subAreas.filter((t) => t.parentTagId === parentId);
  }, [tagsByCategory, selectedAreaFilter]);

  const handleToggle = async (tagId: number, isActive: boolean) => {
    try {
      await updateTag(tagId, { isActive });
    } catch (err) {
      console.error("Erro ao atualizar tag:", err);
    }
  };

  const handleCreateCustom = async (data: {
    name: string;
    description: string;
    color: string;
    aiCriteria: string;
  }) => {
    setIsSaving(true);
    try {
      await createTag({
        category: "custom",
        name: data.name,
        description: data.description,
        color: data.color,
        aiCriteria: data.aiCriteria,
      });
      setIsDialogOpen(false);
    } catch (err) {
      console.error("Erro ao criar tag:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (tagId: number) => {
    if (!confirm("Tem certeza que deseja excluir esta tag customizada?")) return;
    try {
      await deleteTag(tagId);
    } catch (err) {
      console.error("Erro ao excluir tag:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20 text-red-600">
        <p>{error}</p>
      </div>
    );
  }

  const renderCategorySection = (categoryKey: string, label: string) => {
    const categoryTags = tagsByCategory.get(categoryKey) ?? [];
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {categoryTags.map((tag) => (
          <TagToggleCard
            key={tag.id}
            tag={tag}
            onToggle={handleToggle}
            isUpdating={isTagUpdating(tag.id)}
          />
        ))}
        {categoryTags.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-full py-4 text-center">
            Nenhuma tag nesta categoria. Execute o seed para criar as tags predefinidas.
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Tags de Classificação</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Ative ou desative tags para classificação de casos. Tags ativas ficam disponíveis no Kanban.
        </p>
      </div>

      <Accordion type="multiple" defaultValue={["area_direito"]} className="space-y-2">
        {/* Áreas do Direito */}
        <AccordionItem value="area_direito" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-medium hover:no-underline">
            Áreas do Direito
            <span className="ml-auto mr-2 text-xs text-muted-foreground">
              {(tagsByCategory.get("area_direito") ?? []).filter((t) => t.isActive).length} ativas
            </span>
          </AccordionTrigger>
          <AccordionContent>
            {renderCategorySection("area_direito", "Áreas do Direito")}
          </AccordionContent>
        </AccordionItem>

        {/* Sub-áreas */}
        <AccordionItem value="sub_area" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-medium hover:no-underline">
            Sub-áreas
            <span className="ml-auto mr-2 text-xs text-muted-foreground">
              {(tagsByCategory.get("sub_area") ?? []).filter((t) => t.isActive).length} ativas
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="mb-3">
              <Label className="text-xs text-muted-foreground">Filtrar por área</Label>
              <select
                value={selectedAreaFilter}
                onChange={(e) => setSelectedAreaFilter(e.target.value)}
                className="flex h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm mt-1"
              >
                <option value="">Todas as áreas</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {filteredSubAreas.map((tag) => (
                <TagToggleCard
                  key={tag.id}
                  tag={tag}
                  onToggle={handleToggle}
                  isUpdating={isTagUpdating(tag.id)}
                />
              ))}
              {filteredSubAreas.length === 0 && (
                <p className="text-sm text-muted-foreground col-span-full py-4 text-center">
                  Nenhuma sub-área encontrada.
                </p>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Urgência */}
        <AccordionItem value="urgencia" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-medium hover:no-underline">
            Níveis de Urgência
            <span className="ml-auto mr-2 text-xs text-muted-foreground">
              {(tagsByCategory.get("urgencia") ?? []).filter((t) => t.isActive).length} ativas
            </span>
          </AccordionTrigger>
          <AccordionContent>
            {renderCategorySection("urgencia", "Urgência")}
          </AccordionContent>
        </AccordionItem>

        {/* Estágio */}
        <AccordionItem value="estagio" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-medium hover:no-underline">
            Estágios do Caso
            <span className="ml-auto mr-2 text-xs text-muted-foreground">
              {(tagsByCategory.get("estagio") ?? []).filter((t) => t.isActive).length} ativas
            </span>
          </AccordionTrigger>
          <AccordionContent>
            {renderCategorySection("estagio", "Estágio")}
          </AccordionContent>
        </AccordionItem>

        {/* Qualidade do Lead */}
        <AccordionItem value="qualidade_lead" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-medium hover:no-underline">
            Qualidade do Lead
            <span className="ml-auto mr-2 text-xs text-muted-foreground">
              {(tagsByCategory.get("qualidade_lead") ?? []).filter((t) => t.isActive).length} ativas
            </span>
          </AccordionTrigger>
          <AccordionContent>
            {renderCategorySection("qualidade_lead", "Qualidade do Lead")}
          </AccordionContent>
        </AccordionItem>

        {/* Custom */}
        <AccordionItem value="custom" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-medium hover:no-underline">
            Tags Customizadas
            <span className="ml-auto mr-2 text-xs text-muted-foreground">
              {(tagsByCategory.get("custom") ?? []).length} criadas
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="mb-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Nova Tag
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {(tagsByCategory.get("custom") ?? []).map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <TagBadge name={tag.name} color={tag.color} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={tag.isActive}
                      onCheckedChange={(checked) => handleToggle(tag.id, checked)}
                      disabled={isTagUpdating(tag.id)}
                    />
                    <button
                      onClick={() => handleDelete(tag.id)}
                      className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950 text-muted-foreground hover:text-red-600 transition-colors"
                      title="Excluir tag"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {(tagsByCategory.get("custom") ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground col-span-full py-4 text-center">
                  Nenhuma tag customizada. Clique em &quot;Nova Tag&quot; para criar.
                </p>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <CustomTagDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSave={handleCreateCustom}
        isSaving={isSaving}
      />
    </div>
  );
}
