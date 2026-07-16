-- ADR-022 - Camada de Enriquecimento: Fichas Higienizadas, Cartões de Insight
-- e Relações Tipadas de Conceito
-- Cobre aqui: escopo de conceito (§4), relações tipadas (§3), cartões de insight (§2).
-- A parte de fichas higienizadas (§1) é um prompt do Fluxo 02 (n8n) + reprocessamento
-- em lote — não tem migration de schema própria, fica para uma etapa separada.
-- Idempotente: seguro rodar mais de uma vez.

-- ============================================================
-- 1. Escopo de conceito (ADR-022 §4, aditivo à ADR-011 §4)
-- ============================================================
-- 'tematico' é o default: todo conceito nasce tratado como específico do tema da
-- sessão até a passada de enriquecimento (ou revisão humana) marcar como 'universal'.

ALTER TABLE editorial.concepts ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'tematico';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'concepts_scope_valid') THEN
        ALTER TABLE editorial.concepts
            ADD CONSTRAINT concepts_scope_valid CHECK (scope IN ('universal', 'tematico'));
    END IF;
END $$;

-- ============================================================
-- 2. Relações tipadas de conceito (ADR-022 §3, completa ADR-012 §2)
-- ============================================================
-- O schema (relation_type, direction) já existe desde a ADR-012. Aqui só ampliamos
-- o vocabulário controlado além de cooccurrence/causal/evolutionary.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'concept_relations_type_valid') THEN
        ALTER TABLE editorial.concept_relations DROP CONSTRAINT concept_relations_type_valid;
    END IF;
    ALTER TABLE editorial.concept_relations
        ADD CONSTRAINT concept_relations_type_valid
        CHECK (relation_type IN (
            'cooccurrence', 'causal', 'evolutionary',
            'pre_requisito', 'contraste', 'manifestacao_de'
        ));
END $$;

-- ============================================================
-- 3. Cartões de insight filosófico (ADR-022 §2)
-- ============================================================
-- Um segmento pode ter múltiplos cartões. Gerados sob demanda (nunca em lote
-- automático), sempre com gate humano (status) antes de aparecer definitivamente
-- ligado a um segmento em qualquer capítulo publicado.

CREATE TABLE IF NOT EXISTS editorial.segment_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segment_id UUID NOT NULL REFERENCES editorial.content_segments(id) ON DELETE CASCADE,
    concept_title TEXT NOT NULL,
    explanation TEXT NOT NULL,
    philosophical_context TEXT NOT NULL,
    practical_application TEXT NOT NULL,
    related_concepts JSONB NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'suggested',
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    model TEXT NOT NULL,
    CONSTRAINT segment_insights_status_valid CHECK (status IN ('suggested', 'reviewed', 'dismissed'))
);

CREATE INDEX IF NOT EXISTS idx_segment_insights_segment ON editorial.segment_insights(segment_id);
