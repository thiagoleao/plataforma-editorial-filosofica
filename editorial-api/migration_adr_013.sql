-- ADR-013 - Projetos de Livro e Montagem de Capítulos
-- Idempotente: seguro rodar mais de uma vez.

CREATE TABLE IF NOT EXISTS editorial.book_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT book_projects_status_valid CHECK (status IN ('draft', 'in_progress', 'published'))
);

CREATE TABLE IF NOT EXISTS editorial.chapters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_project_id UUID NOT NULL REFERENCES editorial.book_projects(id) ON DELETE CASCADE,
    chapter_order INTEGER NOT NULL,
    title TEXT NOT NULL,
    -- lista de editorial.concepts.id (uuid como texto) que definem o escopo tematico do capitulo
    thematic_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chapters_status_valid CHECK (status IN ('draft', 'assembled', 'reviewed', 'final')),
    CONSTRAINT chapters_unique_order UNIQUE (book_project_id, chapter_order)
);
CREATE INDEX IF NOT EXISTS idx_chapters_book_project ON editorial.chapters(book_project_id);

-- Regra central da ADR-013 §2: um segmento (principalmente canalizacoes) sempre entra
-- como literal_segment, nunca reescrito. O texto em si nao e duplicado aqui - vive em
-- content_segments.full_text / knowledge_cards.summary. A coluna "content" so existe
-- para transition_context (texto de transicao, quando escrito manualmente por um humano).
CREATE TABLE IF NOT EXISTS editorial.chapter_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id UUID NOT NULL REFERENCES editorial.chapters(id) ON DELETE CASCADE,
    segment_id UUID REFERENCES editorial.content_segments(id) ON DELETE SET NULL,
    knowledge_card_id UUID REFERENCES editorial.knowledge_cards(id) ON DELETE SET NULL,
    source_order INTEGER NOT NULL,
    inclusion_type TEXT NOT NULL,
    content TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chapter_sources_inclusion_type_valid
        CHECK (inclusion_type IN ('literal_segment', 'card_synthesis', 'transition_context')),
    CONSTRAINT chapter_sources_literal_requires_segment
        CHECK (inclusion_type <> 'literal_segment' OR segment_id IS NOT NULL),
    CONSTRAINT chapter_sources_synthesis_requires_card
        CHECK (inclusion_type <> 'card_synthesis' OR knowledge_card_id IS NOT NULL),
    CONSTRAINT chapter_sources_unique_order UNIQUE (chapter_id, source_order)
);
CREATE INDEX IF NOT EXISTS idx_chapter_sources_chapter ON editorial.chapter_sources(chapter_id);

-- ADR-013 §4: cada nova montagem (propose ou edicao manual) que substitui fontes
-- ja existentes gera uma revisao, mesmo padrao de segment_revisions/card_revisions.
CREATE TABLE IF NOT EXISTS editorial.chapter_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id UUID NOT NULL REFERENCES editorial.chapters(id) ON DELETE CASCADE,
    title TEXT,
    thematic_scope JSONB,
    status TEXT,
    sources_snapshot JSONB NOT NULL,
    superseded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chapter_revisions_chapter ON editorial.chapter_revisions(chapter_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON editorial.book_projects TO editorial_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON editorial.chapters TO editorial_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON editorial.chapter_sources TO editorial_app;
GRANT SELECT, INSERT ON editorial.chapter_revisions TO editorial_app;
