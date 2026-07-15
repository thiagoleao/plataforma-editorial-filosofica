"use client";

import { useMemo, useState } from "react";
import type { Concept } from "@/lib/editorial-api";

export default function ConceptPicker({ concepts }: { concepts: Concept[] }) {
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return concepts;
    return concepts.filter((c) => c.canonical_name.toLowerCase().includes(term));
  }, [concepts, filter]);

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">
        Escopo temático <span className="font-normal text-gray-500">(opcional)</span>
      </label>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Só serve de filtro inicial para o painel de busca do capítulo — você continua livre para
        adicionar qualquer coisa do acervo depois, independente do escopo.
      </p>
      <input
        type="text"
        placeholder="Filtrar conceitos..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
      />
      {selected.size > 0 && (
        <p className="text-xs text-gray-500">{selected.size} selecionado(s)</p>
      )}
      <div className="max-h-48 overflow-y-auto rounded-md border border-gray-200 p-2 dark:border-gray-800">
        <div className="flex flex-wrap gap-1.5">
          {filtered.map((concept) => {
            const active = selected.has(concept.canonical_name);
            return (
              <label
                key={concept.id}
                className={`cursor-pointer select-none rounded-full border px-2.5 py-1 text-xs ${
                  active
                    ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                    : "border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-300"
                }`}
              >
                <input
                  type="checkbox"
                  name="thematic_scope"
                  value={concept.canonical_name}
                  checked={active}
                  onChange={() => toggle(concept.canonical_name)}
                  className="hidden"
                />
                {concept.canonical_name}
              </label>
            );
          })}
          {filtered.length === 0 && (
            <p className="p-2 text-xs text-gray-500">Nenhum conceito encontrado.</p>
          )}
        </div>
      </div>
    </div>
  );
}
