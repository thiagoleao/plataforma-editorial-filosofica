-- ADR-019 - Sugestões Automáticas de Capítulos
-- Idempotente: seguro rodar mais de uma vez.

CREATE TABLE IF NOT EXISTS editorial.chapter_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    thematic_scope JSONB NOT NULL DEFAULT '[]',
    proposed_sources JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'suggested',
    promoted_chapter_id UUID REFERENCES editorial.chapters(id),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    model TEXT NOT NULL,
    CONSTRAINT chapter_suggestions_status_valid CHECK (status IN ('suggested', 'dismissed', 'promoted')),
    CONSTRAINT chapter_suggestions_promotion_consistent CHECK (
        (status = 'promoted' AND promoted_chapter_id IS NOT NULL) OR
        (status != 'promoted' AND promoted_chapter_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_chapter_suggestions_status ON editorial.chapter_suggestions(status);
