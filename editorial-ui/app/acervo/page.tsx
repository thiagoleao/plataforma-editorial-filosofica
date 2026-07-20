import {
  listAllSegmentInsights,
  listConcepts,
  listKnowledgeCards,
  listThemes,
} from "@/lib/editorial-api";
import StatusBadge from "@/components/StatusBadge";
import GenerateInsightsButton from "@/components/GenerateInsightsButton";

export const dynamic = "force-dynamic";

export default async function AcervoPage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string; concept?: string }>;
}) {
  const { theme, concept } = await searchParams;

  const [themes, concepts, cards, insights] = await Promise.all([
    listThemes(),
    listConcepts(30),
    listKnowledgeCards({ theme, concept, limit: 30 }),
    listAllSegmentInsights({ limit: 30 }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Explorar acervo</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Navegue pelo que já foi destilado — fichas, conceitos e cartões de insight — sem
          precisar montar um capítulo. Só leitura, nada aqui altera o acervo.
        </p>
      </div>

      <form className="glass-card flex flex-wrap items-end gap-3 p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="theme" className="text-sm font-medium">
            Tema
          </label>
          <select id="theme" name="theme" defaultValue={theme ?? ""} className="glass-input">
            <option value="">Todos os temas</option>
            {themes.map((t) => (
              <option key={t.id} value={t.theme_key}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="concept" className="text-sm font-medium">
            Conceito
          </label>
          <input
            id="concept"
            name="concept"
            defaultValue={concept ?? ""}
            placeholder="ex.: transmutação"
            className="glass-input"
          />
        </div>
        <button type="submit" className="glass-pill glass-pill-primary">
          Filtrar
        </button>
        {(theme || concept) && (
          <a href="/acervo" className="glass-link text-sm">
            Limpar filtros
          </a>
        )}
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Fichas em destaque</h2>
        {cards.length === 0 ? (
          <p className="glass-card p-4 text-sm text-gray-500 dark:text-gray-400">
            Nenhuma ficha encontrada para esse filtro.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {cards.map((card) => (
              <li key={card.id} className="glass-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{card.title}</p>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={card.importance_level} />
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {card.theme_name}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{card.summary}</p>
                {card.concepts.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {card.concepts.map((c) => (
                      <span
                        key={c}
                        className="rounded-full border border-white/60 bg-white/40 px-2 py-0.5 text-xs text-gray-700 backdrop-blur-md dark:border-white/10 dark:bg-white/5 dark:text-gray-300"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Mapa filosófico — conceitos de maior importância</h2>
        {concepts.length === 0 ? (
          <p className="glass-card p-4 text-sm text-gray-500 dark:text-gray-400">
            Nenhum conceito registrado ainda.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {concepts.map((c) => (
              <li
                key={c.id}
                className="glass-item flex items-center gap-2 px-3 py-1.5 text-sm"
                title={c.description ?? undefined}
              >
                <span>{c.canonical_name}</span>
                <StatusBadge status={c.importance_level} />
                {c.scope === "universal" && (
                  <span className="text-[10px] tracking-wide text-indigo-700 uppercase dark:text-indigo-300">
                    universal
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium">Cartões de insight gerados</h2>
          <GenerateInsightsButton />
        </div>
        {insights.length === 0 ? (
          <p className="glass-card p-4 text-sm text-gray-500 dark:text-gray-400">
            Nenhum cartão de insight gerado ainda. Use o botão acima para gerar o primeiro lote.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {insights.map((insight) => (
              <li
                key={insight.id}
                className="rounded-2xl border border-amber-300/60 bg-amber-50/70 p-3 text-sm backdrop-blur-md dark:border-amber-800/50 dark:bg-amber-950/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-amber-900 dark:text-amber-200">
                    {insight.concept_title}
                  </span>
                  <span className="shrink-0 text-xs text-amber-700 dark:text-amber-400">
                    {insight.segment_title}
                  </span>
                </div>
                <p className="mt-1 text-amber-900 dark:text-amber-100">{insight.explanation}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
