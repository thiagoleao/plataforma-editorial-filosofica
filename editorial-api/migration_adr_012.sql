-- ADR-012 - Mapa Filosófico Automatizado (parte 1: coocorrência + importância)
-- A parte de busca semântica (pgvector/embeddings) fica para uma migration separada,
-- pendente da escolha do modelo de embedding (ADR-012 §4).
-- Idempotente: seguro rodar mais de uma vez.

-- ============================================================
-- 1. Importância editorial em editorial.concepts
-- ============================================================

ALTER TABLE editorial.concepts ADD COLUMN IF NOT EXISTS importance_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE editorial.concepts ADD COLUMN IF NOT EXISTS importance_level TEXT NOT NULL DEFAULT 'emergente';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'concepts_importance_range') THEN
        ALTER TABLE editorial.concepts
            ADD CONSTRAINT concepts_importance_range CHECK (importance_score BETWEEN 0 AND 100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'concepts_importance_level_valid') THEN
        ALTER TABLE editorial.concepts
            ADD CONSTRAINT concepts_importance_level_valid
            CHECK (importance_level IN ('emergente', 'apoio', 'forte', 'pilar'));
    END IF;
END $$;

-- ============================================================
-- 2. Coocorrência de conceitos (Mapa Filosófico)
-- ============================================================
-- Relação não-direcionada: concept_a_id sempre a menor UUID do par, para não duplicar
-- (a,b) e (b,a). Relações direcionais (causa/consequência) ficam para quando houver
-- critério de evidência textual em múltiplas fontes (ADR-012 §2) — fora de escopo aqui.

CREATE TABLE IF NOT EXISTS editorial.concept_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    concept_a_id UUID NOT NULL REFERENCES editorial.concepts(id) ON DELETE CASCADE,
    concept_b_id UUID NOT NULL REFERENCES editorial.concepts(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL DEFAULT 'cooccurrence',
    direction TEXT,
    cooccurrence_count INTEGER NOT NULL DEFAULT 0,
    first_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT concept_relations_order CHECK (concept_a_id < concept_b_id),
    CONSTRAINT concept_relations_unique_pair UNIQUE (concept_a_id, concept_b_id),
    CONSTRAINT concept_relations_type_valid CHECK (relation_type IN ('cooccurrence', 'causal', 'evolutionary'))
);
CREATE INDEX IF NOT EXISTS idx_concept_relations_a ON editorial.concept_relations(concept_a_id);
CREATE INDEX IF NOT EXISTS idx_concept_relations_b ON editorial.concept_relations(concept_b_id);

-- ============================================================
-- 3. Recálculo determinístico (não-LLM) de coocorrência e importância
-- ============================================================
-- Fórmula v1 (ADR-012 §3) — documentada aqui, pesos ajustáveis em revisão futura:
--   importance_score = MIN(100,
--       MIN(session_count, 8)     * 4 +   -- até 32 pts: em quantas sessões distintas aparece
--       MIN(occurrence_count, 15) * 2 +   -- até 30 pts: recorrência (segmentos + fichas)
--       MIN(relation_count, 12)   * 3     -- até 36 pts: conexões no Mapa Filosófico
--   )
--   importance_level: <25 emergente, 25-49 apoio, 50-74 forte, >=75 pilar
-- Ficha (knowledge_card): importance_score = média do importance_score dos seus conceitos.

CREATE OR REPLACE FUNCTION editorial.recalculate_concept_graph()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- 3.1 Coocorrência: pares de conceitos que aparecem juntos no mesmo segmento OU na mesma ficha
    WITH pairs AS (
        SELECT LEAST(sc1.concept_id, sc2.concept_id) AS a, GREATEST(sc1.concept_id, sc2.concept_id) AS b
        FROM editorial.segment_concepts sc1
        JOIN editorial.segment_concepts sc2
          ON sc1.segment_id = sc2.segment_id AND sc1.concept_id <> sc2.concept_id
        UNION ALL
        SELECT LEAST(cc1.concept_id, cc2.concept_id) AS a, GREATEST(cc1.concept_id, cc2.concept_id) AS b
        FROM editorial.card_concepts cc1
        JOIN editorial.card_concepts cc2
          ON cc1.card_id = cc2.card_id AND cc1.concept_id <> cc2.concept_id
    ),
    counted AS (
        SELECT a, b, count(*) AS cooccurrence_count
        FROM pairs
        GROUP BY a, b
    )
    INSERT INTO editorial.concept_relations (concept_a_id, concept_b_id, cooccurrence_count, last_observed_at)
    SELECT a, b, cooccurrence_count, NOW()
    FROM counted
    ON CONFLICT (concept_a_id, concept_b_id) DO UPDATE SET
        cooccurrence_count = EXCLUDED.cooccurrence_count,
        last_observed_at = NOW(),
        updated_at = NOW();

    -- remove relações que não têm mais evidência (ex.: segmento/ficha reprocessado sem esses conceitos)
    DELETE FROM editorial.concept_relations cr
    WHERE NOT EXISTS (
        SELECT 1 FROM editorial.segment_concepts sc1
        JOIN editorial.segment_concepts sc2 ON sc1.segment_id = sc2.segment_id AND sc1.concept_id <> sc2.concept_id
        WHERE LEAST(sc1.concept_id, sc2.concept_id) = cr.concept_a_id
          AND GREATEST(sc1.concept_id, sc2.concept_id) = cr.concept_b_id
    ) AND NOT EXISTS (
        SELECT 1 FROM editorial.card_concepts cc1
        JOIN editorial.card_concepts cc2 ON cc1.card_id = cc2.card_id AND cc1.concept_id <> cc2.concept_id
        WHERE LEAST(cc1.concept_id, cc2.concept_id) = cr.concept_a_id
          AND GREATEST(cc1.concept_id, cc2.concept_id) = cr.concept_b_id
    );

    -- 3.2 Importância dos conceitos
    WITH stats AS (
        SELECT
            c.id AS concept_id,
            (
                SELECT count(DISTINCT s.session_date)
                FROM editorial.segment_concepts sc
                JOIN editorial.content_segments cs ON cs.id = sc.segment_id
                JOIN editorial.sources s ON s.id = cs.source_id
                WHERE sc.concept_id = c.id
            ) + (
                SELECT count(DISTINCT s.session_date)
                FROM editorial.card_concepts cc
                JOIN editorial.knowledge_cards kc ON kc.id = cc.card_id
                JOIN editorial.sources s ON s.id = kc.source_id
                WHERE cc.concept_id = c.id
            ) AS session_count_raw,
            (
                (SELECT count(*) FROM editorial.segment_concepts sc WHERE sc.concept_id = c.id) +
                (SELECT count(*) FROM editorial.card_concepts cc WHERE cc.concept_id = c.id)
            ) AS occurrence_count,
            (
                SELECT count(*) FROM editorial.concept_relations cr
                WHERE cr.concept_a_id = c.id OR cr.concept_b_id = c.id
            ) AS relation_count
        FROM editorial.concepts c
    ),
    scored AS (
        SELECT
            concept_id,
            LEAST(100,
                LEAST(session_count_raw, 8) * 4 +
                LEAST(occurrence_count, 15) * 2 +
                LEAST(relation_count, 12) * 3
            ) AS score
        FROM stats
    )
    UPDATE editorial.concepts c
    SET importance_score = scored.score,
        importance_level = CASE
            WHEN scored.score >= 75 THEN 'pilar'
            WHEN scored.score >= 50 THEN 'forte'
            WHEN scored.score >= 25 THEN 'apoio'
            ELSE 'emergente'
        END,
        updated_at = NOW()
    FROM scored
    WHERE c.id = scored.concept_id;

    -- 3.3 Importância das fichas: média da importância dos conceitos que ela aborda
    UPDATE editorial.knowledge_cards kc
    SET importance_score = rounded.score,
        importance_level = CASE
            WHEN rounded.score >= 75 THEN 'pilar'
            WHEN rounded.score >= 50 THEN 'forte'
            WHEN rounded.score >= 25 THEN 'apoio'
            ELSE 'emergente'
        END
    FROM (
        SELECT cc.card_id, ROUND(AVG(c.importance_score))::int AS score
        FROM editorial.card_concepts cc
        JOIN editorial.concepts c ON c.id = cc.concept_id
        GROUP BY cc.card_id
    ) rounded
    WHERE kc.id = rounded.card_id;
END;
$$;

-- Roda uma primeira vez já com os dados existentes
SELECT editorial.recalculate_concept_graph();

-- ============================================================
-- 4. Permissões
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON editorial.concept_relations TO editorial_app;
GRANT EXECUTE ON FUNCTION editorial.recalculate_concept_graph() TO editorial_app;
