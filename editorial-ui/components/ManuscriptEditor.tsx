"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { ManuscriptDoc } from "@/lib/editorial-api";
import { checkpointChapterManuscriptAction, saveChapterManuscriptAction } from "@/lib/actions";
import { LiteralSegment } from "./LiteralSegmentNode";

export default function ManuscriptEditor({
  chapterId,
  bookProjectId,
  initialContent,
  initialUpdatedAt,
}: {
  chapterId: string;
  bookProjectId: string;
  initialContent: ManuscriptDoc;
  initialUpdatedAt: string | null;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const editor = useEditor({
    extensions: [StarterKit, LiteralSegment],
    content: initialContent,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "min-h-[24rem] text-sm leading-relaxed focus:outline-none [&_p]:mb-3",
      },
    },
  });

  function handleSave() {
    if (!editor) return;
    setMessage(null);
    startTransition(async () => {
      // ProseMirror monta os objetos `attrs` de cada nó com prototype nulo internamente —
      // o serializador de argumentos de Server Action do Next.js não reconhece isso como
      // objeto plano e substitui o valor por uma referência vazia ("$T"), silenciosamente
      // perdendo segmentId/title/text de todo nó literalSegment. JSON.parse(JSON.stringify())
      // força objetos planos genuínos antes de enviar.
      const plainContent = JSON.parse(JSON.stringify(editor.getJSON())) as ManuscriptDoc;
      const result = await saveChapterManuscriptAction(chapterId, bookProjectId, plainContent);
      setMessage(result.ok ? "Manuscrito salvo." : `Erro ao salvar: ${result.error}`);
      router.refresh();
    });
  }

  function handleCheckpoint() {
    setMessage(null);
    startTransition(async () => {
      const result = await checkpointChapterManuscriptAction(chapterId);
      setMessage(result.ok ? "Versão salva no histórico." : `Erro ao salvar versão: ${result.error}`);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {initialUpdatedAt
            ? `Última gravação: ${new Date(initialUpdatedAt).toLocaleString("pt-BR")}`
            : "Manuscrito ainda não salvo — composto a partir das fontes do capítulo."}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCheckpoint}
            disabled={isPending || !initialUpdatedAt}
            title={!initialUpdatedAt ? "Salve o manuscrito ao menos uma vez antes de criar uma versão" : ""}
            className="glass-pill glass-pill-secondary glass-pill-sm"
          >
            Salvar versão
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

      {message && <p className="glass-alert-info">{message}</p>}

      <div className="glass-card p-4">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
