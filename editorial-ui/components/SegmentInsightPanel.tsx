"use client";

import { useState, useTransition } from "react";
import type { SegmentInsight } from "@/lib/editorial-api";
import {
  dismissSegmentInsightAction,
  generateSegmentInsightsAction,
  reviewSegmentInsightAction,
} from "@/lib/actions";

export default function SegmentInsightPanel({ segmentId }: { segmentId: string }) {
  const [open, setOpen] = useState(false);
  const [insights, setInsights] = useState<SegmentInsight[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function loadInsights() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/segments/${segmentId}/insights`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Erro ao carregar cartões");
      setInsights(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar cartões");
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && insights === null) loadInsights();
  }

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateSegmentInsightsAction(segmentId);
      if (result.ok) {
        setInsights((prev) => [...(prev ?? []), ...result.data]);
      } else {
        setError(result.error);
      }
    });
  }

  function handleReview(insightId: string) {
    startTransition(async () => {
      const result = await reviewSegmentInsightAction(insightId);
      if (result.ok) {
        setInsights((prev) => prev?.map((i) => (i.id === insightId ? result.data : i)) ?? null);
      }
    });
  }

  function handleDismiss(insightId: string) {
    startTransition(async () => {
      const result = await dismissSegmentInsightAction(insightId);
      if (result.ok) {
        setInsights((prev) => prev?.map((i) => (i.id === insightId ? result.data : i)) ?? null);
      }
    });
  }

  const visibleInsights = (insights ?? []).filter((i) => i.status !== "dismissed");

  return (
    <div className="mt-2 border-t border-gray-100 pt-2 dark:border-gray-800">
      <button type="button" onClick={toggle} className="text-xs text-gray-500 hover:underline">
        {open ? "Ocultar cartões de insight" : "Cartões de insight"}
        {insights && visibleInsights.length > 0 ? ` (${visibleInsights.length})` : ""}
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {loading && <p className="text-xs text-gray-500">Carregando…</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}

          {visibleInsights.map((insight) => (
            <div
              key={insight.id}
              className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs dark:border-amber-900 dark:bg-amber-950"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-amber-900 dark:text-amber-200">
                  Nota de contextualização — {insight.concept_title}
                </span>
                <span className="shrink-0 text-[10px] uppercase text-amber-700 dark:text-amber-400">
                  {insight.status === "suggested" ? "sugerido" : "revisado"}
                </span>
              </div>
              <p className="mt-1 text-amber-900 dark:text-amber-100">{insight.explanation}</p>
              <p className="mt-1 text-amber-800 dark:text-amber-200">
                <span className="font-medium">Contexto filosófico: </span>
                {insight.philosophical_context}
              </p>
              <p className="mt-1 text-amber-800 dark:text-amber-200">
                <span className="font-medium">Aplicação prática: </span>
                {insight.practical_application}
              </p>
              <div className="mt-2 flex gap-3">
                {insight.status === "suggested" && (
                  <button
                    type="button"
                    onClick={() => handleReview(insight.id)}
                    disabled={isPending}
                    className="text-[11px] text-amber-700 hover:underline disabled:opacity-40 dark:text-amber-400"
                  >
                    Marcar como revisado
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDismiss(insight.id)}
                  disabled={isPending}
                  className="text-[11px] text-amber-700 hover:underline disabled:opacity-40 dark:text-amber-400"
                >
                  Descartar
                </button>
              </div>
            </div>
          ))}

          {!loading && visibleInsights.length === 0 && (
            <p className="text-xs text-gray-500">Nenhum cartão de insight ainda.</p>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isPending}
            className="self-start rounded-md border border-gray-300 px-2 py-1 text-[11px] font-medium hover:bg-gray-100 disabled:opacity-40 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            {isPending ? "Gerando…" : "Gerar cartão de insight"}
          </button>
        </div>
      )}
    </div>
  );
}
