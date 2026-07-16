"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ChapterDetail, Concept, SearchResult } from "@/lib/editorial-api";
import {
  approveChapterAction,
  proposeChapterAction,
  reviewChapterAction,
  runConsolidationCheckAction,
  saveChapterSourcesAction,
} from "@/lib/actions";
import SourceResultCard from "./SourceResultCard";
import StatusBadge from "./StatusBadge";
import TransitionEditor from "./TransitionEditor";

type LocalSource = {
  key: string;
  segment_id: string | null;
  knowledge_card_id: string | null;
  inclusion_type: "literal_segment" | "card_synthesis" | "transition_context";
  content: string | null;
  title: string;
  snippet: string | null;
  fullText: string | null;
  segmentType: string | null;
  isChanneled: boolean | null;
};

function fromChapterSources(chapter: ChapterDetail): LocalSource[] {
  return chapter.sources.map((s) => ({
    key: s.id,
    segment_id: s.segment_id,
    knowledge_card_id: s.knowledge_card_id,
    inclusion_type: s.inclusion_type,
    content: s.content,
    title: s.segment_title ?? s.card_title ?? "(sem título)",
    snippet: s.card_summary ?? null,
    fullText: s.segment_full_text ?? null,
    segmentType: s.segment_type,
    isChanneled: s.is_channeled,
  }));
}

export default function ChapterBuilder({
  chapter,
  concepts,
}: {
  chapter: ChapterDetail;
  concepts: Concept[];
}) {
  const [sources, setSources] = useState<LocalSource[]>(() => fromChapterSources(chapter));
  const [query, setQuery] = useState("");
  const [conceptFilter, setConceptFilter] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewedBy, setReviewedBy] = useState("");
  const [checklist, setChecklist] = useState<Awaited<
    ReturnType<typeof runConsolidationCheckAction>
  > | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const usedIds = new Set(
    sources.flatMap((s) => [s.segment_id, s.knowledge_card_id].filter(Boolean) as string[])
  );

  async function runSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    setConceptFilter("");
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 12 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Erro na busca");
      setResults(data);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Erro na busca");
    } finally {
      setSearching(false);
    }
  }

  async function browseByConcept(conceptName: string) {
    setConceptFilter(conceptName);
    setQuery("");
    setSearching(true);
    setSearchError(null);
    try {
      const [segRes, cardRes] = await Promise.all([
        fetch(`/api/segments?concept=${encodeURIComponent(conceptName)}&limit=20`),
        fetch(`/api/knowledge-cards?concept=${encodeURIComponent(conceptName)}&limit=20`),
      ]);
      const segs = await segRes.json();
      const cards = await cardRes.json();
      if (!segRes.ok) throw new Error(segs.error ?? "Erro ao buscar segmentos");
      if (!cardRes.ok) throw new Error(cards.error ?? "Erro ao buscar fichas");
      const merged: SearchResult[] = [
        ...segs.map(
          (s: {
            id: string;
            title: string;
            executive_summary: string | null;
            segment_type: string;
            is_channeled: boolean;
            external_file_id: string;
            source_file_name: string;
            session_date: string | null;
          }) => ({
            result_type: "segment" as const,
            id: s.id,
            title: s.title,
            executive_summary: s.executive_summary ?? undefined,
            segment_type: s.segment_type,
            is_channeled: s.is_channeled,
            external_file_id: s.external_file_id,
            source_file_name: s.source_file_name,
            session_date: s.session_date,
            similarity: 1,
          })
        ),
        ...cards.map(
          (c: {
            id: string;
            title: string;
            summary: string;
            importance_score: number;
            importance_level: string;
            external_file_id: string;
            source_file_name: string;
            session_date: string | null;
          }) => ({
            result_type: "knowledge_card" as const,
            id: c.id,
            title: c.title,
            summary: c.summary,
            importance_score: c.importance_score,
            importance_level: c.importance_level,
            external_file_id: c.external_file_id,
            source_file_name: c.source_file_name,
            session_date: c.session_date,
            similarity: 1,
          })
        ),
      ];
      setResults(merged);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Erro ao navegar por conceito");
    } finally {
      setSearching(false);
    }
  }

  function addResult(result: SearchResult) {
    if (usedIds.has(result.id)) return;
    const isSegment = result.result_type === "segment";
    setSources((prev) => [
      ...prev,
      {
        key: `new-${result.id}`,
        segment_id: isSegment ? result.id : null,
        knowledge_card_id: isSegment ? null : result.id,
        inclusion_type: isSegment ? "literal_segment" : "card_synthesis",
        content: null,
        title: result.title,
        snippet: result.summary ?? result.executive_summary ?? null,
        fullText: null,
        segmentType: result.segment_type ?? null,
        isChanneled: result.is_channeled ?? null,
      },
    ]);
  }

  function removeSource(key: string) {
    setSources((prev) => prev.filter((s) => s.key !== key));
  }

  function moveSource(key: string, direction: -1 | 1) {
    setSources((prev) => {
      const index = prev.findIndex((s) => s.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      const payload = sources.map((s) => ({
        segment_id: s.segment_id,
        knowledge_card_id: s.knowledge_card_id,
        inclusion_type: s.inclusion_type,
        content: s.content,
      }));
      const result = await saveChapterSourcesAction(chapter.id, chapter.book_project_id, payload);
      setMessage(result.ok ? "Fontes salvas." : `Erro ao salvar: ${result.error}`);
      router.refresh();
    });
  }

  function addTransitionBlock() {
    setSources((prev) => [
      ...prev,
      {
        key: `new-transition-${Date.now()}`,
        segment_id: null,
        knowledge_card_id: null,
        inclusion_type: "transition_context",
        content: "",
        title: "Bloco de transição",
        snippet: null,
        fullText: null,
        segmentType: null,
        isChanneled: null,
      },
    ]);
  }

  function updateTransitionContent(key: string, text: string) {
    setSources((prev) => prev.map((s) => (s.key === key ? { ...s, content: text } : s)));
  }

  function handlePropose() {
    setMessage(null);
    startTransition(async () => {
      const result = await proposeChapterAction(chapter.id, chapter.book_project_id, 15);
      setMessage(
        result.ok
          ? "Sugestão gerada e salva como rascunho — revise e ajuste antes de aprovar."
          : `Erro ao sugerir: ${result.error}`
      );
      router.refresh();
    });
  }

  function handleApprove() {
    setMessage(null);
    startTransition(async () => {
      const result = await approveChapterAction(chapter.id, chapter.book_project_id);
      setMessage(result.ok ? "Capítulo aprovado." : `Erro ao aprovar: ${result.error}`);
      router.refresh();
    });
  }

  function handleReview() {
    if (!reviewedBy.trim()) {
      setMessage("Informe quem está revisando.");
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await reviewChapterAction(chapter.id, chapter.book_project_id, reviewedBy.trim());
      setMessage(result.ok ? "Capítulo marcado como revisado." : `Erro ao revisar: ${result.error}`);
      router.refresh();
    });
  }

  function handleChecklist() {
    setMessage(null);
    startTransition(async () => {
      const result = await runConsolidationCheckAction(chapter.id);
      setChecklist(result);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <StatusBadge status={chapter.status} />
          {chapter.reviewed_by && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              revisado por {chapter.reviewed_by} em{" "}
              {chapter.reviewed_at ? new Date(chapter.reviewed_at).toLocaleDateString("pt-BR") : ""}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleChecklist}
            disabled={isPending}
            className="glass-pill glass-pill-secondary glass-pill-sm"
          >
            Rodar checklist de consolidação
          </button>
          {chapter.status === "draft" && (
            <button
              type="button"
              onClick={handleApprove}
              disabled={isPending || sources.length === 0}
              className="glass-pill glass-pill-primary glass-pill-sm"
            >
              Aprovar capítulo
            </button>
          )}
          {chapter.status === "assembled" && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Seu nome"
                value={reviewedBy}
                onChange={(e) => setReviewedBy(e.target.value)}
                className="glass-input px-2 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={handleReview}
                disabled={isPending}
                className="glass-pill glass-pill-primary glass-pill-sm"
              >
                Marcar como revisado
              </button>
            </div>
          )}
        </div>
      </div>

      {message && <p className="glass-alert-info">{message}</p>}

      {checklist && (
        <div className="glass-card p-3 text-sm">
          {checklist.ok ? (
            checklist.data.issues.length === 0 ? (
              <p>Nenhum problema encontrado no checklist.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {checklist.data.issues.map((issue, i) => (
                  <li
                    key={i}
                    className="rounded-xl bg-amber-50/70 p-2 text-amber-900 backdrop-blur-md dark:bg-amber-950/40 dark:text-amber-200"
                  >
                    <span className="font-medium">{issue.type}</span>
                    {issue.detail && <span> — {issue.detail}</span>}
                    {issue.alias_found && (
                      <span>
                        {" "}
                        — usa &quot;{issue.alias_found}&quot;, nome canônico é &quot;
                        {issue.canonical_name}&quot;
                      </span>
                    )}
                    {issue.similarity !== undefined && (
                      <span> — similaridade {(issue.similarity * 100).toFixed(0)}%</span>
                    )}
                  </li>
                ))}
              </ul>
            )
          ) : (
            <p className="text-red-600 dark:text-red-400">Erro: {checklist.error}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Painel de exploração */}
        <div className="flex flex-col gap-3">
          <h2 className="font-medium">Explorar acervo</h2>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Buscar por sentido (ex: medo de ficar sozinho)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              className="glass-input flex-1"
            />
            <button
              type="button"
              onClick={runSearch}
              disabled={searching}
              className="glass-pill glass-pill-secondary"
            >
              Buscar
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">ou navegue por conceito:</span>
            {(chapter.thematic_scope.length > 0
              ? concepts.filter((c) => chapter.thematic_scope.includes(c.id))
              : concepts.slice(0, 12)
            ).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => browseByConcept(c.canonical_name)}
                className={`rounded-full px-2 py-0.5 text-[11px] backdrop-blur-md transition-all duration-150 ${
                  conceptFilter === c.canonical_name
                    ? "bg-indigo-900/90 text-white dark:bg-white/90 dark:text-indigo-950"
                    : "border border-white/60 bg-white/40 text-gray-600 hover:bg-white/60 dark:border-white/10 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10"
                }`}
              >
                {c.canonical_name}
              </button>
            ))}
          </div>

          {searchError && <p className="text-sm text-red-600 dark:text-red-400">{searchError}</p>}

          <div className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto">
            {results.map((result) => (
              <SourceResultCard
                key={`${result.result_type}-${result.id}`}
                kind={result.result_type}
                segmentId={result.result_type === "segment" ? result.id : null}
                title={result.title}
                snippet={result.summary ?? result.executive_summary ?? null}
                segmentType={result.segment_type}
                isChanneled={result.is_channeled}
                similarity={result.similarity < 1 ? result.similarity : undefined}
                actionLabel={usedIds.has(result.id) ? "Já adicionado" : "Adicionar"}
                disabled={usedIds.has(result.id)}
                onAction={() => addResult(result)}
              />
            ))}
            {results.length === 0 && !searching && (
              <p className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                Busque algo ou clique num conceito para começar a explorar.
              </p>
            )}
          </div>
        </div>

        {/* Painel do capítulo */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Fontes do capítulo ({sources.length})</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={addTransitionBlock}
                disabled={isPending}
                className="glass-pill glass-pill-secondary glass-pill-sm"
              >
                + Bloco de transição
              </button>
              <button
                type="button"
                onClick={handlePropose}
                disabled={isPending}
                title="Atalho opcional: sugere uma montagem inicial para você editar. Nunca é obrigatório."
                className="glass-pill glass-pill-secondary glass-pill-sm"
              >
                Sugerir automaticamente
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="glass-pill glass-pill-primary glass-pill-sm"
              >
                Salvar
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {sources.map((source, index) => {
              const moveControls = (
                <div className="flex gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <button
                    type="button"
                    onClick={() => moveSource(source.key, -1)}
                    disabled={index === 0}
                    className="hover:underline disabled:opacity-30"
                  >
                    ↑ mover para cima
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSource(source.key, 1)}
                    disabled={index === sources.length - 1}
                    className="hover:underline disabled:opacity-30"
                  >
                    ↓ mover para baixo
                  </button>
                </div>
              );

              if (source.inclusion_type === "transition_context") {
                return (
                  <div key={source.key} className="glass-item text-sm">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 backdrop-blur-md dark:bg-amber-900 dark:text-amber-200">
                        Transição — texto próprio
                      </span>
                      <button
                        type="button"
                        onClick={() => removeSource(source.key)}
                        className="glass-pill glass-pill-secondary glass-pill-sm shrink-0"
                      >
                        Remover
                      </button>
                    </div>
                    <TransitionEditor
                      value={source.content}
                      onChange={(text) => updateTransitionContent(source.key, text)}
                    />
                    <div className="mt-1">{moveControls}</div>
                  </div>
                );
              }

              return (
                <SourceResultCard
                  key={source.key}
                  kind={source.segment_id ? "segment" : "knowledge_card"}
                  segmentId={source.segment_id}
                  title={source.title}
                  snippet={source.snippet}
                  fullText={source.fullText}
                  segmentType={source.segmentType}
                  isChanneled={source.isChanneled}
                  actionLabel="Remover"
                  onAction={() => removeSource(source.key)}
                  extra={<div className="mt-1">{moveControls}</div>}
                />
              );
            })}
            {sources.length === 0 && (
              <p className="glass-card p-6 text-center text-sm text-gray-500 dark:text-gray-400">
                Nenhuma fonte ainda. Adicione a partir do painel de exploração à esquerda.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
