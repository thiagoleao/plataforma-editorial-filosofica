"use client";

import { useState } from "react";
import SegmentInsightPanel from "./SegmentInsightPanel";

export type CardKind = "segment" | "knowledge_card";

export default function SourceResultCard({
  kind,
  segmentId,
  title,
  snippet,
  fullText,
  segmentType,
  isChanneled,
  similarity,
  actionLabel,
  onAction,
  disabled,
  extra,
}: {
  kind: CardKind;
  segmentId?: string | null;
  title: string;
  snippet: string | null;
  fullText?: string | null;
  segmentType?: string | null;
  isChanneled?: boolean | null;
  similarity?: number;
  actionLabel: string;
  onAction?: () => void;
  disabled?: boolean;
  extra?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="glass-item text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] font-medium backdrop-blur-md ${
                kind === "segment"
                  ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                  : "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200"
              }`}
            >
              {kind === "segment" ? "Segmento" : "Ficha"}
            </span>
            {isChanneled && (
              <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[11px] font-medium text-indigo-800 backdrop-blur-md dark:bg-indigo-900 dark:text-indigo-200">
                Canalização — literal
              </span>
            )}
            {segmentType && !isChanneled && (
              <span className="text-[11px] text-gray-500 dark:text-gray-400">{segmentType}</span>
            )}
            {similarity !== undefined && (
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                sim. {(similarity * 100).toFixed(0)}%
              </span>
            )}
          </div>
          <p className="mt-1 font-medium">{title}</p>
          {snippet && (
            <p className="mt-1 text-gray-600 dark:text-gray-400">
              {expanded ? snippet : `${snippet.slice(0, 220)}${snippet.length > 220 ? "…" : ""}`}
            </p>
          )}
          {fullText && expanded && (
            <div className="mt-2 max-h-64 overflow-y-auto rounded-xl bg-white/60 p-2 text-xs whitespace-pre-wrap text-gray-700 backdrop-blur-md dark:bg-black/20 dark:text-gray-300">
              {fullText}
            </div>
          )}
          {(snippet || fullText) && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="glass-link mt-1 text-xs text-gray-500 dark:text-gray-400"
            >
              {expanded ? "Ver menos" : "Ler mais"}
            </button>
          )}
          {extra}
          {kind === "segment" && segmentId && <SegmentInsightPanel segmentId={segmentId} />}
        </div>
        <button
          type="button"
          onClick={onAction}
          disabled={disabled}
          className="glass-pill glass-pill-secondary glass-pill-sm shrink-0"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
