"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Tags, Search, Loader2, Bot } from "lucide-react";
import { fetchTagsClient, fetchCaseTagsClient, setCaseTagsClient } from "@/services/tags-client";
import type { TagPublicRow, CaseTagWithDetails } from "@/services/tags";
import { TAG_CATEGORIES } from "@/lib/tags/predefined-tags";

type CaseTagSelectorProps = {
  caseId: number;
  institutionId: number;
};

function TagBadge({
  name,
  color,
  assignedBy,
  confidence,
  onRemove,
}: {
  name: string;
  color: string;
  assignedBy?: string;
  confidence?: number | null;
  onRemove?: () => void;
}) {
  const isAI = assignedBy === "ai";
  const title = isAI
    ? `Atribuída por IA${confidence != null ? ` - ${Math.round(confidence * 100)}% confiança` : ""}`
    : undefined;

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full text-white group"
      style={{ backgroundColor: color }}
      title={title}
    >
      {isAI && <Bot className="h-2.5 w-2.5" />}
      {name}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 opacity-60 hover:opacity-100"
        >
          ×
        </button>
      )}
    </span>
  );
}

export function CaseTagSelector({ caseId, institutionId }: CaseTagSelectorProps) {
  const [allTags, setAllTags] = useState<TagPublicRow[]>([]);
  const [caseTags, setCaseTags] = useState<CaseTagWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Load tags
  useEffect(() => {
    if (!caseId || !institutionId) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const [tags, ct] = await Promise.all([
          fetchTagsClient(institutionId),
          fetchCaseTagsClient(caseId),
        ]);
        if (cancelled) return;
        setAllTags(tags.filter((t) => t.isActive));
        setCaseTags(ct);
      } catch (err) {
        console.error("Erro ao carregar tags:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [caseId, institutionId]);

  const selectedTagIds = useMemo(
    () => new Set(caseTags.map((ct) => ct.tagId)),
    [caseTags],
  );

  // Group active tags by category
  const tagsByCategory = useMemo(() => {
    const filtered = search
      ? allTags.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
      : allTags;

    const map = new Map<string, TagPublicRow[]>();
    for (const tag of filtered) {
      const list = map.get(tag.category) ?? [];
      list.push(tag);
      map.set(tag.category, list);
    }
    return map;
  }, [allTags, search]);

  const toggleTag = useCallback(
    async (tagId: number) => {
      const newIds = selectedTagIds.has(tagId)
        ? [...selectedTagIds].filter((id) => id !== tagId)
        : [...selectedTagIds, tagId];

      setIsSaving(true);
      try {
        const updated = await setCaseTagsClient(caseId, newIds);
        setCaseTags(updated);
      } catch (err) {
        console.error("Erro ao atualizar tags:", err);
      } finally {
        setIsSaving(false);
      }
    },
    [caseId, selectedTagIds],
  );

  const removeTag = useCallback(
    async (tagId: number) => {
      const newIds = [...selectedTagIds].filter((id) => id !== tagId);
      setIsSaving(true);
      try {
        const updated = await setCaseTagsClient(caseId, newIds);
        setCaseTags(updated);
      } catch (err) {
        console.error("Erro ao remover tag:", err);
      } finally {
        setIsSaving(false);
      }
    },
    [caseId, selectedTagIds],
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando tags...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Selected tags preview */}
      {caseTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {caseTags.map((ct) => (
            <TagBadge
              key={ct.id}
              name={ct.name}
              color={ct.color}
              assignedBy={ct.assignedBy}
              confidence={ct.confidence}
              onRemove={() => removeTag(ct.tagId)}
            />
          ))}
        </div>
      )}

      {/* Popover for adding tags */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <Tags className="h-3.5 w-3.5" />
            {caseTags.length > 0 ? "Editar Tags" : "Adicionar Tags"}
            {isSaving && <Loader2 className="h-3 w-3 animate-spin" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          {/* Search */}
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar tags..."
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>

          {/* Tag list by category */}
          <div className="max-h-[300px] overflow-y-auto p-1">
            {TAG_CATEGORIES.map(({ value, label }) => {
              const categoryTags = tagsByCategory.get(value);
              if (!categoryTags?.length) return null;

              return (
                <div key={value} className="mb-1">
                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {label}
                  </div>
                  {categoryTags.map((tag) => {
                    const isSelected = selectedTagIds.has(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.id)}
                        disabled={isSaving}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-muted/50 transition-colors text-left"
                      >
                        <div
                          className="w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0"
                          style={{
                            borderColor: tag.color,
                            backgroundColor: isSelected ? tag.color : "transparent",
                          }}
                        >
                          {isSelected && (
                            <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white fill-current">
                              <path d="M10 3L4.5 8.5L2 6" stroke="white" strokeWidth="2" fill="none" />
                            </svg>
                          )}
                        </div>
                        <span
                          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="truncate text-xs">{tag.name}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {tagsByCategory.size === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {search ? "Nenhuma tag encontrada." : "Nenhuma tag ativa. Configure em Configurações > Tags."}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
