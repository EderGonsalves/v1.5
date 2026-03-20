"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { TagPublicRow } from "@/services/tags";
import {
  fetchTagsClient,
  createTagClient,
  updateTagClient,
  deleteTagClient,
  seedTagsClient,
} from "@/services/tags-client";

export const useTags = (
  institutionId: number | undefined,
  category?: string,
) => {
  const [tags, setTags] = useState<TagPublicRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
  const isFetchingRef = useRef(false);
  const seededRef = useRef(false);

  const fetchTags = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!institutionId) return;
      if (isFetchingRef.current) return;

      isFetchingRef.current = true;
      const { silent } = options;
      if (!silent) setIsLoading(true);
      setError(null);

      try {
        const data = await fetchTagsClient(institutionId, category);
        setTags(data);

        // Auto-seed if no tags exist
        if (data.length === 0 && !seededRef.current) {
          seededRef.current = true;
          try {
            await seedTagsClient(institutionId);
            const refreshed = await fetchTagsClient(institutionId, category);
            setTags(refreshed);
          } catch {
            // Seed failed — ignore, user can seed manually
          }
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Erro ao carregar tags",
        );
      } finally {
        isFetchingRef.current = false;
        if (!silent) setIsLoading(false);
      }
    },
    [institutionId, category],
  );

  useEffect(() => {
    if (!institutionId) {
      setIsLoading(false);
      return;
    }
    fetchTags();
  }, [institutionId, fetchTags]);

  const refresh = useCallback(
    () => fetchTags({ silent: true }),
    [fetchTags],
  );

  const createTag = useCallback(
    async (data: {
      category: string;
      name: string;
      description?: string;
      color?: string;
      sortOrder?: number;
      parentTagId?: number | null;
      aiCriteria?: string;
      institutionId?: number;
    }) => {
      const tag = await createTagClient(data);
      setTags((prev) => [...prev, tag]);
      return tag;
    },
    [],
  );

  const updateTag = useCallback(
    async (
      tagId: number,
      data: {
        name?: string;
        description?: string;
        color?: string;
        isActive?: boolean;
        sortOrder?: number;
        aiCriteria?: string;
      },
    ) => {
      setUpdatingIds((prev) => new Set(prev).add(tagId));
      try {
        const updated = await updateTagClient(tagId, data);
        setTags((prev) =>
          prev.map((t) => (t.id === tagId ? updated : t)),
        );
        return updated;
      } finally {
        setUpdatingIds((prev) => {
          const next = new Set(prev);
          next.delete(tagId);
          return next;
        });
      }
    },
    [],
  );

  const deleteTag = useCallback(async (tagId: number) => {
    setUpdatingIds((prev) => new Set(prev).add(tagId));
    try {
      await deleteTagClient(tagId);
      setTags((prev) => prev.filter((t) => t.id !== tagId));
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(tagId);
        return next;
      });
    }
  }, []);

  const isTagUpdating = useCallback(
    (tagId: number) => updatingIds.has(tagId),
    [updatingIds],
  );

  return {
    tags,
    isLoading,
    error,
    refresh,
    createTag,
    updateTag,
    deleteTag,
    isTagUpdating,
  };
};
