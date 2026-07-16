import Link from "next/link";
import { listChapterSuggestions } from "@/lib/editorial-api";
import StatusBadge from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function ChapterSuggestionsPage() {
  const suggestions = await listChapterSuggestions();
  const visible = suggestions.filter((s) => s.status !== "dismissed");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Sugestões de capítulo</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Candidatos a capítulo gerados periodicamente a partir do acervo (ADR-019) — nada aqui
          vira capítulo de verdade sem você promover explicitamente.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((suggestion) => (
          <Link
            key={suggestion.id}
            href={`/chapter-suggestions/${suggestion.id}`}
            className="flex flex-col gap-2 rounded-lg border border-gray-200 p-4 hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-gray-900"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">{suggestion.title}</p>
              <StatusBadge status={suggestion.status} />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">{suggestion.summary}</p>
            <p className="text-xs text-gray-400">
              gerado em {new Date(suggestion.generated_at).toLocaleDateString("pt-BR")}
            </p>
          </Link>
        ))}
        {visible.length === 0 && (
          <p className="col-span-full rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
            Nenhuma sugestão ainda. Elas aparecem aqui conforme o acervo é varrido periodicamente.
          </p>
        )}
      </div>
    </div>
  );
}
