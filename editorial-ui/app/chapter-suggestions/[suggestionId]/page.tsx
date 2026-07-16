import Link from "next/link";
import { notFound } from "next/navigation";
import {
  EditorialApiError,
  getChapterSuggestion,
  listBookProjects,
} from "@/lib/editorial-api";
import { dismissChapterSuggestionAction, promoteChapterSuggestionAction } from "@/lib/actions";
import StatusBadge from "@/components/StatusBadge";
import SourceResultCard from "@/components/SourceResultCard";

export const dynamic = "force-dynamic";

export default async function ChapterSuggestionPage({
  params,
}: {
  params: Promise<{ suggestionId: string }>;
}) {
  const { suggestionId } = await params;

  let suggestion;
  try {
    suggestion = await getChapterSuggestion(suggestionId);
  } catch (error) {
    if (error instanceof EditorialApiError && error.status === 404) notFound();
    throw error;
  }
  const projects = await listBookProjects();

  const promoteWithSuggestion = promoteChapterSuggestionAction.bind(null, suggestionId);
  const dismissWithSuggestion = dismissChapterSuggestionAction.bind(null, suggestionId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/chapter-suggestions" className="glass-link text-sm text-gray-500 dark:text-gray-400">
          ← Sugestões
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{suggestion.title}</h1>
          <StatusBadge status={suggestion.status} />
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{suggestion.summary}</p>
      </div>

      {suggestion.status === "promoted" && suggestion.promoted_chapter_id && (
        <p className="rounded-2xl border border-green-300/60 bg-green-50/70 px-3 py-2 text-sm text-green-900 backdrop-blur-md dark:border-green-800/50 dark:bg-green-950/40 dark:text-green-200">
          Já promovida para um capítulo real.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="font-medium">Fontes propostas ({suggestion.sources.length})</h2>
        {suggestion.sources.map((source) => (
          <SourceResultCard
            key={source.id}
            kind={source.segment_id ? "segment" : "knowledge_card"}
            segmentId={source.segment_id}
            title={source.segment_title ?? source.card_title ?? "(sem título)"}
            snippet={source.card_summary}
            fullText={source.segment_full_text}
            segmentType={source.segment_type}
            isChanneled={source.is_channeled}
            actionLabel="Sugerida"
            disabled
          />
        ))}
      </div>

      {suggestion.status === "suggested" && (
        <div className="glass-card flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
          <form action={promoteWithSuggestion} className="flex flex-1 flex-wrap items-end gap-3">
            <div className="flex flex-1 min-w-48 flex-col gap-1">
              <label htmlFor="book_project_id" className="text-sm font-medium">
                Promover para o projeto<span className="text-red-500"> *</span>
              </label>
              <select id="book_project_id" name="book_project_id" required className="glass-input">
                <option value="">Selecione…</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex w-28 flex-col gap-1">
              <label htmlFor="chapter_order" className="text-sm font-medium">
                Ordem
              </label>
              <input
                id="chapter_order"
                name="chapter_order"
                type="number"
                min={1}
                placeholder="auto"
                className="glass-input"
              />
            </div>
            <button type="submit" className="glass-pill glass-pill-primary">
              Promover
            </button>
          </form>
          <form action={dismissWithSuggestion}>
            <button type="submit" className="glass-pill glass-pill-secondary">
              Descartar
            </button>
          </form>
        </div>
      )}

      {projects.length === 0 && suggestion.status === "suggested" && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Você ainda não tem nenhum projeto de livro — <Link href="/" className="glass-link">crie um primeiro</Link>{" "}
          para poder promover esta sugestão.
        </p>
      )}
    </div>
  );
}
