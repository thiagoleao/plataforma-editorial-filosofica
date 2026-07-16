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
      const result = await saveChapterManuscriptAction(
        chapterId,
        bookProjectId,
        editor.getJSON() as ManuscriptDoc
      );
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
        <p className="text-xs text-gray-500">
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
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-100 disabled:opacity-40 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Salvar versão
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
          >
            Salvar
          </button>
        </div>
      </div>

      {message && (
        <p className="rounded-md border border-gray-200 bg-gray-100 px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900">
          {message}
        </p>
      )}

      <div className="rounded-md border border-gray-300 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
