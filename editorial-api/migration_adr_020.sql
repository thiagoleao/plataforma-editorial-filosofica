-- ADR-020 Fase B: manuscrito continuo por capitulo, com blocos literal_segment travados.
--
-- manuscript_content guarda o documento Tiptap (JSON) inteiro -- nao e composto a partir de
-- chapter_sources em tempo real, porque o texto de transicao/ficha dentro do manuscrito pode
-- ser polido/reescrito (ADR-020 Fase B), diferente do chapter_sources.content que alimenta
-- embeddings/checklist (ADR-014). O manuscrito e uma camada de composicao final, separada.
--
-- A integridade dos blocos literal_segment dentro do manuscrito NUNCA e garantida por este
-- schema sozinho -- e responsabilidade do endpoint PUT /chapters/<id>/manuscript verificar,
-- a cada salvamento, que todo segment_id presente antes continua presente depois com o texto
-- identico a content_segments.full_text (fonte de verdade). Ver nota de implementacao da
-- ADR-020 para o desenho completo dessa verificacao.
ALTER TABLE editorial.chapters
    ADD COLUMN IF NOT EXISTS manuscript_content JSONB,
    ADD COLUMN IF NOT EXISTS manuscript_updated_at TIMESTAMPTZ;

-- Checkpoints explicitos ("salvar versao") do manuscrito -- distinto de chapter_revisions,
-- que so snapshotta chapter_sources e dispara automaticamente a cada PUT /sources. Aqui o
-- checkpoint e sempre uma acao humana deliberada (nunca automatico/silencioso).
CREATE TABLE IF NOT EXISTS editorial.chapter_manuscript_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id UUID NOT NULL REFERENCES editorial.chapters(id) ON DELETE CASCADE,
    manuscript_content JSONB NOT NULL,
    label TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chapter_manuscript_revisions_chapter
    ON editorial.chapter_manuscript_revisions (chapter_id, created_at DESC);
