-- ADR-011 - Fundação de Dados da Camada Editorial
-- Idempotente: seguro rodar mais de uma vez.
-- Requer privilégio para CREATE EXTENSION (rode como usuário postgres, não editorial_app).

CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent() é STABLE (depende de configuração de busca textual), não pode ser usada
-- diretamente em índice/coluna gerada. Wrapper IMMUTABLE é o padrão usual para isso.
CREATE OR REPLACE FUNCTION editorial.immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT unaccent('unaccent', $1)
$$;

-- ============================================================
-- 1. Vocabulário controlado de tipos de segmento (ADR-010)
-- ============================================================

CREATE TABLE IF NOT EXISTS editorial.segment_types (
    type_key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    editorially_disposable BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO editorial.segment_types (type_key, name, description, editorially_disposable) VALUES
    ('canalizacao_filosofica', 'Canalização Filosófica',
        'Discursos completos provenientes das consciências canalizadas. Preservação literal obrigatória (ADR-010).', FALSE),
    ('explicacao', 'Explicação',
        'Momentos em que um conceito é desenvolvido de forma didática.', FALSE),
    ('perguntas_respostas', 'Perguntas e Respostas',
        'Interações relevantes entre participantes e consciência canalizada.', FALSE),
    ('exercicio', 'Exercícios',
        'Práticas propostas durante a sessão.', FALSE),
    ('meditacao', 'Meditações',
        'Momentos destinados exclusivamente à condução meditativa.', FALSE),
    ('orientacao_administrativa', 'Orientações Administrativas',
        'Informações operacionais sem valor editorial. Descartável das etapas posteriores.', TRUE)
ON CONFLICT (type_key) DO NOTHING;

-- Todos os valores de segment_type já gravados hoje batem exatamente com as chaves acima
-- (verificado em produção em 2026-07-14: 43/43 segmentos). A FK abaixo só é aplicada
-- depois do seed para não quebrar caso surja algum valor fora da lista.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_segments_segment_type'
    ) THEN
        ALTER TABLE editorial.content_segments
            ADD CONSTRAINT fk_segments_segment_type
            FOREIGN KEY (segment_type) REFERENCES editorial.segment_types(type_key);
    END IF;
END $$;

-- ============================================================
-- 2. Identidade de quem fala (consciências canalizadas / condutor)
-- ============================================================
-- Nota (ADR-011 §3): os dados atuais só distinguem "consciencia_canalizada" vs
-- vazio/condutor. Não há hoje captura de QUAL consciência específica fala em cada
-- segmento. Esta tabela cria a estrutura; povoar com identidades reais requer
-- levantamento com o autor e, provavelmente, ajuste no Fluxo 02 para capturar essa
-- distinção na origem — não é possível derivar isso do texto sem risco de inventar.

CREATE TABLE IF NOT EXISTS editorial.speakers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    speaker_key TEXT NOT NULL UNIQUE,
    canonical_name TEXT NOT NULL,
    aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
    description TEXT,
    is_channeled_entity BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO editorial.speakers (speaker_key, canonical_name, is_channeled_entity, description) VALUES
    ('consciencia_canalizada', 'Consciência Canalizada (não especificada)', TRUE,
        'Marcador genérico usado até aqui pelo Fluxo 02 para qualquer fala canalizada, sem distinguir identidade entre diferentes consciências.'),
    ('condutor_sessao', 'Condutor(a) da Sessão', FALSE,
        'Fala do facilitador humano da sessão, quando não atribuída a uma consciência canalizada.')
ON CONFLICT (speaker_key) DO NOTHING;

ALTER TABLE editorial.content_segments ADD COLUMN IF NOT EXISTS speaker_id UUID REFERENCES editorial.speakers(id);

UPDATE editorial.content_segments
SET speaker_id = (SELECT id FROM editorial.speakers WHERE speaker_key = 'consciencia_canalizada')
WHERE speaker_type = 'consciencia_canalizada' AND speaker_id IS NULL;

UPDATE editorial.content_segments
SET speaker_id = (SELECT id FROM editorial.speakers WHERE speaker_key = 'condutor_sessao')
WHERE (speaker_type IS NULL OR speaker_type = '') AND speaker_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_segments_speaker ON editorial.content_segments(speaker_id);

-- ============================================================
-- 3. Conceitos normalizados
-- ============================================================

CREATE TABLE IF NOT EXISTS editorial.concepts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name TEXT NOT NULL,
    normalized_key TEXT GENERATED ALWAYS AS (
        editorial.immutable_unaccent(lower(regexp_replace(trim(canonical_name), '[-_]+', ' ', 'g')))
    ) STORED,
    aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
    description TEXT,
    first_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_concepts_normalized_key ON editorial.concepts (normalized_key);

CREATE TABLE IF NOT EXISTS editorial.segment_concepts (
    segment_id UUID NOT NULL REFERENCES editorial.content_segments(id) ON DELETE CASCADE,
    concept_id UUID NOT NULL REFERENCES editorial.concepts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (segment_id, concept_id)
);
CREATE INDEX IF NOT EXISTS idx_segment_concepts_concept ON editorial.segment_concepts(concept_id);

CREATE TABLE IF NOT EXISTS editorial.card_concepts (
    card_id UUID NOT NULL REFERENCES editorial.knowledge_cards(id) ON DELETE CASCADE,
    concept_id UUID NOT NULL REFERENCES editorial.concepts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (card_id, concept_id)
);
CREATE INDEX IF NOT EXISTS idx_card_concepts_concept ON editorial.card_concepts(concept_id);

-- Backfill: cria conceitos canônicos a partir do texto livre já existente.
-- Para cada chave normalizada, usa a primeira variante em ordem alfabética como
-- canonical_name (ajustável manualmente depois — isto é só o ponto de partida).
WITH raw_concepts AS (
    SELECT jsonb_array_elements_text(concepts) AS concept FROM editorial.content_segments
    UNION ALL
    SELECT jsonb_array_elements_text(concepts) AS concept FROM editorial.knowledge_cards
),
normalized AS (
    SELECT DISTINCT trim(concept) AS concept
    FROM raw_concepts
    WHERE trim(concept) <> ''
)
INSERT INTO editorial.concepts (canonical_name)
SELECT DISTINCT ON (editorial.immutable_unaccent(lower(regexp_replace(concept, '[-_]+', ' ', 'g'))))
    concept
FROM normalized
ORDER BY editorial.immutable_unaccent(lower(regexp_replace(concept, '[-_]+', ' ', 'g'))), concept
ON CONFLICT (normalized_key) DO NOTHING;

-- Backfill das junções segmento<->conceito e ficha<->conceito
INSERT INTO editorial.segment_concepts (segment_id, concept_id)
SELECT DISTINCT cs.id, co.id
FROM editorial.content_segments cs
CROSS JOIN LATERAL jsonb_array_elements_text(cs.concepts) AS concept_text
JOIN editorial.concepts co
  ON co.normalized_key = editorial.immutable_unaccent(lower(regexp_replace(trim(concept_text), '[-_]+', ' ', 'g')))
WHERE trim(concept_text) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO editorial.card_concepts (card_id, concept_id)
SELECT DISTINCT kc.id, co.id
FROM editorial.knowledge_cards kc
CROSS JOIN LATERAL jsonb_array_elements_text(kc.concepts) AS concept_text
JOIN editorial.concepts co
  ON co.normalized_key = editorial.immutable_unaccent(lower(regexp_replace(trim(concept_text), '[-_]+', ' ', 'g')))
WHERE trim(concept_text) <> ''
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. Trilha de auditoria para reprocessamento
-- ============================================================

CREATE TABLE IF NOT EXISTS editorial.segment_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segment_id UUID NOT NULL REFERENCES editorial.content_segments(id) ON DELETE CASCADE,
    segment_key TEXT NOT NULL,
    segment_order INTEGER,
    segment_type TEXT,
    title TEXT,
    executive_summary TEXT,
    full_text TEXT,
    keywords JSONB,
    concepts JSONB,
    related_themes JSONB,
    editorial_applications JSONB,
    editorial_relevance INTEGER,
    speaker_type TEXT,
    is_channeled BOOLEAN,
    superseded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_segment_revisions_segment ON editorial.segment_revisions(segment_id);

CREATE TABLE IF NOT EXISTS editorial.card_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES editorial.knowledge_cards(id) ON DELETE CASCADE,
    card_key TEXT NOT NULL,
    title TEXT,
    summary TEXT,
    concepts JSONB,
    principles JSONB,
    quotes JSONB,
    evidence JSONB,
    relevance_score INTEGER,
    superseded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_card_revisions_card ON editorial.card_revisions(card_id);

-- ============================================================
-- 5. Constraints de integridade adicionais
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cards_relevance_range') THEN
        ALTER TABLE editorial.knowledge_cards
            ADD CONSTRAINT cards_relevance_range CHECK (relevance_score BETWEEN 0 AND 100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cards_importance_level_valid') THEN
        ALTER TABLE editorial.knowledge_cards
            ADD CONSTRAINT cards_importance_level_valid
            CHECK (importance_level IS NULL OR importance_level IN ('emergente', 'apoio', 'forte', 'pilar'));
    END IF;
END $$;

-- ============================================================
-- 6. Permissões
-- ============================================================

GRANT SELECT ON editorial.segment_types TO editorial_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON editorial.speakers TO editorial_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON editorial.concepts TO editorial_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON editorial.segment_concepts TO editorial_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON editorial.card_concepts TO editorial_app;
GRANT SELECT, INSERT ON editorial.segment_revisions TO editorial_app;
GRANT SELECT, INSERT ON editorial.card_revisions TO editorial_app;
