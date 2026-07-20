"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateSegmentInsightsBatchAction } from "@/lib/actions";

export default function GenerateInsightsButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleClick() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await generateSegmentInsightsBatchAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const { processed, errors } = result.data;
      const created = processed.reduce((sum, p) => sum + p.insights_created, 0);
      if (processed.length === 0 && errors.length === 0) {
        setMessage("Nenhum segmento elegível — todos os canalizados já têm cartão de insight.");
      } else {
        setMessage(
          `${created} cartão(ões) gerado(s) a partir de ${processed.length} segmento(s)` +
            (errors.length > 0 ? `, ${errors.length} com erro` : "") +
            "."
        );
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="glass-pill glass-pill-secondary glass-pill-sm"
      >
        {isPending ? "Gerando…" : "Gerar mais insights (lote de 5)"}
      </button>
      {message && (
        <p className="max-w-xs text-right text-xs text-gray-500 dark:text-gray-400">{message}</p>
      )}
      {error && <p className="max-w-xs text-right text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
