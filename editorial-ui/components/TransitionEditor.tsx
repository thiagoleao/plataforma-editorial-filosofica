"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

export default function TransitionEditor({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (text: string) => void;
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value ?? "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "min-h-[4rem] text-sm leading-relaxed text-gray-900 focus:outline-none dark:text-gray-100 [&_p]:mb-2 last:[&_p]:mb-0",
      },
    },
    onUpdate: ({ editor }) => {
      // chapter_sources.content é TEXT puro (ver migration_adr_013.sql) — alimenta
      // geração de embedding e casamento de terminologia no checklist de consolidação
      // (ADR-014), então persiste texto plano, nunca o HTML do editor.
      onChange(editor.getText({ blockSeparator: "\n\n" }));
    },
  });

  return (
    <div className="rounded-md border border-gray-300 bg-white p-2 dark:border-gray-700 dark:bg-gray-900">
      <EditorContent editor={editor} />
    </div>
  );
}
