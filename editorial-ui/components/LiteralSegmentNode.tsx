import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";

function LiteralSegmentView({ node }: NodeViewProps) {
  const title = node.attrs.title as string;
  const text = node.attrs.text as string;
  return (
    <NodeViewWrapper
      className="my-2 rounded-2xl border border-indigo-300/60 bg-indigo-50/70 p-3 backdrop-blur-md dark:border-indigo-800/50 dark:bg-indigo-950/40"
      contentEditable={false}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-300">
        <span>🔒</span>
        <span>Canalização — literal, preservado{title ? ` — ${title}` : ""}</span>
      </div>
      <div className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">{text}</div>
    </NodeViewWrapper>
  );
}

/**
 * Bloco travado (ADR-020 Fase B): sem `content` no schema (leaf/atom), então não há
 * superfície editável — digitar dentro é estruturalmente impossível, não só bloqueado por
 * CSS. A trava real contra remoção/substituição do nó inteiro é o filterTransaction abaixo,
 * que rejeita qualquer transação que derrube um segmentId presente antes da edição. Isso é
 * só a defesa do lado do cliente — a garantia de verdade é o servidor
 * (PUT /chapters/<id>/manuscript, ver main.py), que nunca confia neste componente.
 */
export const LiteralSegment = Node.create({
  name: "literalSegment",
  group: "block",
  atom: true,
  selectable: true,
  isolating: true,

  addAttributes() {
    return {
      segmentId: { default: null },
      title: { default: "" },
      text: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-literal-segment]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-literal-segment": "" }, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(LiteralSegmentView);
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("literalSegmentGuard"),
        filterTransaction: (tr, state) => {
          if (!tr.docChanged) return true;
          const before = new Set<string>();
          state.doc.descendants((node) => {
            if (node.type.name === "literalSegment") before.add(node.attrs.segmentId);
          });
          const after = new Set<string>();
          tr.doc.descendants((node) => {
            if (node.type.name === "literalSegment") after.add(node.attrs.segmentId);
          });
          for (const id of before) {
            if (!after.has(id)) return false;
          }
          return true;
        },
      }),
    ];
  },
});

export default LiteralSegment;
