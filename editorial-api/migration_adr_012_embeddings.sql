-- ADR-012 §4-5 - Busca semântica (embeddings)
-- Modelo escolhido: OpenAI text-embedding-3-small (1536 dimensões) — bom custo/qualidade,
-- já é o provedor usado no restante do projeto. Ajustável no futuro (a coluna embedding_model
-- registra qual modelo gerou cada vetor, para permitir migração gradual se o modelo mudar).
-- Idempotente: seguro rodar mais de uma vez.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE editorial.content_segments ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE editorial.content_segments ADD COLUMN IF NOT EXISTS embedding_model TEXT;
ALTER TABLE editorial.content_segments ADD COLUMN IF NOT EXISTS embedding_generated_at TIMESTAMPTZ;

ALTER TABLE editorial.knowledge_cards ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE editorial.knowledge_cards ADD COLUMN IF NOT EXISTS embedding_model TEXT;
ALTER TABLE editorial.knowledge_cards ADD COLUMN IF NOT EXISTS embedding_generated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_segments_embedding
    ON editorial.content_segments USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_cards_embedding
    ON editorial.knowledge_cards USING hnsw (embedding vector_cosine_ops);
