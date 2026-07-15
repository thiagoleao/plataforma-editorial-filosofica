-- ADR-014 - Revisão Editorial e Consolidação de Capítulos
-- Idempotente: seguro rodar mais de uma vez.

-- ADR-014 §3: chapters.status só avança para 'reviewed' com reviewed_by/reviewed_at
-- preenchidos — sempre um humano, nunca automático (aplicado no código da API, não
-- é possível expressar "preenchido só por humano" como constraint de banco).
ALTER TABLE editorial.chapters ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE editorial.chapters ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
