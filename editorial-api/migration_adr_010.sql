CREATE TABLE IF NOT EXISTS editorial.content_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segment_key TEXT NOT NULL UNIQUE,
    source_id UUID NOT NULL REFERENCES editorial.sources(id) ON DELETE CASCADE,
    segment_order INTEGER NOT NULL,
    segment_type TEXT NOT NULL,
    title TEXT NOT NULL,
    executive_summary TEXT,
    full_text TEXT NOT NULL,
    keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
    concepts JSONB NOT NULL DEFAULT '[]'::jsonb,
    related_themes JSONB NOT NULL DEFAULT '[]'::jsonb,
    editorial_applications JSONB NOT NULL DEFAULT '[]'::jsonb,
    editorial_relevance INTEGER NOT NULL DEFAULT 0,
    speaker_type TEXT,
    is_channeled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT segments_relevance_range CHECK (editorial_relevance BETWEEN 0 AND 100)
);

ALTER TABLE editorial.knowledge_cards
    ADD COLUMN IF NOT EXISTS segment_id UUID
        REFERENCES editorial.content_segments(id)
        ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_segments_source ON editorial.content_segments(source_id);
CREATE INDEX IF NOT EXISTS idx_segments_type ON editorial.content_segments(segment_type);
CREATE INDEX IF NOT EXISTS idx_segments_channeled ON editorial.content_segments(is_channeled);
CREATE INDEX IF NOT EXISTS idx_segments_relevance ON editorial.content_segments(editorial_relevance DESC);
CREATE INDEX IF NOT EXISTS idx_segments_keywords_gin ON editorial.content_segments USING GIN (keywords);
CREATE INDEX IF NOT EXISTS idx_segments_concepts_gin ON editorial.content_segments USING GIN (concepts);
CREATE INDEX IF NOT EXISTS idx_cards_segment ON editorial.knowledge_cards(segment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON editorial.content_segments TO editorial_app;
