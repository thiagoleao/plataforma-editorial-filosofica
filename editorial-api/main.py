import hmac
import math
import os
import uuid
from datetime import datetime, timezone
from functools import wraps

import psycopg2
from flask import Flask, jsonify, request
from openai import OpenAI
from pgvector.psycopg2 import register_vector
from psycopg2.extras import Json, RealDictCursor

app = Flask(__name__)

INSTANCE_CONNECTION_NAME = os.environ["INSTANCE_CONNECTION_NAME"]
DB_NAME = os.environ.get("DB_NAME", "plataforma_editorial_filosofica")
DB_USER = os.environ.get("DB_USER", "editorial_app")
DB_PASSWORD = os.environ["DB_PASSWORD"]
SERVICE_API_KEY = os.environ["SERVICE_API_KEY"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_MAX_CHARS = 20000

openai_client = OpenAI(api_key=OPENAI_API_KEY)


def get_connection():
    connection = psycopg2.connect(
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        host=f"/cloudsql/{INSTANCE_CONNECTION_NAME}",
        connect_timeout=10,
    )
    register_vector(connection)
    return connection


def generate_embedding(text):
    """Gera embedding via OpenAI (ADR-012 §4). Retorna None em caso de falha —
    a falta de embedding nunca deve bloquear a preservação do conteúdo original."""
    text = (text or "").strip()[:EMBEDDING_MAX_CHARS]
    if not text:
        return None
    try:
        response = openai_client.embeddings.create(model=EMBEDDING_MODEL, input=text)
        return response.data[0].embedding
    except Exception:
        app.logger.exception("Failed to generate embedding")
        return None


def require_api_key(function):
    @wraps(function)
    def decorated(*args, **kwargs):
        supplied_key = request.headers.get("X-Service-Api-Key", "")
        if not supplied_key or not hmac.compare_digest(supplied_key, SERVICE_API_KEY):
            return jsonify({"error": "Invalid service API key"}), 401
        return function(*args, **kwargs)
    return decorated


NORMALIZE_CONCEPT_KEY_SQL = "editorial.immutable_unaccent(lower(regexp_replace(trim(%s), '[-_]+', ' ', 'g')))"


def strip_embedding(row):
    """Remove o vetor de embedding de uma linha antes de serializar em JSON
    (tipo vector do pgvector não é serializável e o vetor não é útil ao cliente)."""
    if row is not None:
        row.pop("embedding", None)
    return row


def cosine_similarity(a, b):
    """Similaridade de cosseno entre dois embeddings (ADR-013 §3 — dedup de candidatos)."""
    if a is None or b is None:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def json_safe(value):
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def serialize_rows(rows):
    return [{key: json_safe(value) for key, value in dict(row).items()} for row in rows]


def build_chapter_detail(cursor, chapter_id):
    """Monta o capítulo com o texto das fontes resolvido (ADR-013)."""
    cursor.execute("""
        SELECT ch.*, bp.title AS book_project_title
        FROM editorial.chapters ch
        JOIN editorial.book_projects bp ON bp.id = ch.book_project_id
        WHERE ch.id = %s
    """, (chapter_id,))
    chapter = cursor.fetchone()
    if not chapter:
        return None

    cursor.execute("""
        SELECT
            cs.id, cs.source_order, cs.inclusion_type, cs.content,
            cs.segment_id, cs.knowledge_card_id,
            seg.title AS segment_title, seg.full_text AS segment_full_text,
            seg.segment_type, seg.is_channeled,
            card.title AS card_title, card.summary AS card_summary
        FROM editorial.chapter_sources cs
        LEFT JOIN editorial.content_segments seg ON seg.id = cs.segment_id
        LEFT JOIN editorial.knowledge_cards card ON card.id = cs.knowledge_card_id
        WHERE cs.chapter_id = %s
        ORDER BY cs.source_order
    """, (chapter_id,))
    chapter["sources"] = cursor.fetchall()
    return chapter


def _fetch_chapter_sources(cursor, chapter_id):
    cursor.execute(
        "SELECT * FROM editorial.chapter_sources WHERE chapter_id = %s ORDER BY source_order",
        (chapter_id,),
    )
    return cursor.fetchall()


def snapshot_chapter_revision(cursor, chapter, existing_sources):
    """Grava a revisão do capítulo antes de suas fontes serem substituídas (ADR-013 §4)."""
    if not existing_sources:
        return
    cursor.execute("""
        INSERT INTO editorial.chapter_revisions (chapter_id, title, thematic_scope, status, sources_snapshot)
        VALUES (%(chapter_id)s, %(title)s, %(thematic_scope)s, %(status)s, %(sources_snapshot)s)
    """, {
        "chapter_id": chapter["id"],
        "title": chapter["title"],
        "thematic_scope": Json(chapter["thematic_scope"]),
        "status": chapter["status"],
        "sources_snapshot": Json(serialize_rows(existing_sources)),
    })
    cursor.execute("DELETE FROM editorial.chapter_sources WHERE chapter_id = %s", (chapter["id"],))


def sync_concepts(cursor, concept_texts, segment_id=None, card_id=None):
    """Resolve texto livre de conceitos para editorial.concepts (ADR-011) e grava os vínculos."""
    for raw_text in concept_texts or []:
        text = (raw_text or "").strip()
        if not text:
            continue
        cursor.execute("""
            INSERT INTO editorial.concepts (canonical_name)
            VALUES (%s)
            ON CONFLICT (normalized_key) DO UPDATE SET last_observed_at = NOW()
            RETURNING id
        """, (text,))
        concept_id = cursor.fetchone()["id"]
        if segment_id:
            cursor.execute("""
                INSERT INTO editorial.segment_concepts (segment_id, concept_id)
                VALUES (%s, %s)
                ON CONFLICT DO NOTHING
            """, (segment_id, concept_id))
        if card_id:
            cursor.execute("""
                INSERT INTO editorial.card_concepts (card_id, concept_id)
                VALUES (%s, %s)
                ON CONFLICT DO NOTHING
            """, (card_id, concept_id))


@app.get("/health")
def health():
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        return jsonify({"status": "ok", "database": "connected"})
    except Exception as error:
        app.logger.exception("Health check failed")
        return jsonify({"status": "error", "database": "unavailable", "message": str(error)}), 500


@app.get("/themes")
@require_api_key
def list_themes():
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("""
                SELECT id, theme_key, name, description, minimum_relevance, active
                FROM editorial.themes
                WHERE active = TRUE
                ORDER BY name
            """)
            rows = cursor.fetchall()
    return jsonify(rows)


@app.get("/segment-types")
@require_api_key
def list_segment_types():
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("""
                SELECT type_key, name, description, editorially_disposable
                FROM editorial.segment_types
                ORDER BY name
            """)
            rows = cursor.fetchall()
    return jsonify(rows)


@app.get("/speakers")
@require_api_key
def list_speakers():
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("""
                SELECT id, speaker_key, canonical_name, aliases, description, is_channeled_entity
                FROM editorial.speakers
                ORDER BY canonical_name
            """)
            rows = cursor.fetchall()
    return jsonify(rows)


@app.get("/concepts")
@require_api_key
def list_concepts():
    limit = min(request.args.get("limit", default=100, type=int), 500)
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("""
                SELECT
                    c.id, c.canonical_name, c.aliases, c.description,
                    c.importance_score, c.importance_level,
                    COUNT(DISTINCT sc.segment_id) AS segment_count,
                    COUNT(DISTINCT cc.card_id) AS card_count
                FROM editorial.concepts c
                LEFT JOIN editorial.segment_concepts sc ON sc.concept_id = c.id
                LEFT JOIN editorial.card_concepts cc ON cc.concept_id = c.id
                GROUP BY c.id
                ORDER BY c.importance_score DESC, c.canonical_name
                LIMIT %s
            """, (limit,))
            rows = cursor.fetchall()
    return jsonify(rows)


@app.get("/concepts/<concept_id>/relations")
@require_api_key
def get_concept_relations(concept_id):
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("SELECT id, canonical_name FROM editorial.concepts WHERE id = %s", (concept_id,))
            concept = cursor.fetchone()
            if not concept:
                return jsonify({"error": "Concept not found"}), 404

            cursor.execute("""
                SELECT
                    cr.id, cr.relation_type, cr.direction, cr.cooccurrence_count,
                    cr.first_observed_at, cr.last_observed_at,
                    other.id AS related_concept_id, other.canonical_name AS related_concept_name,
                    other.importance_score AS related_concept_importance_score
                FROM editorial.concept_relations cr
                JOIN editorial.concepts other
                  ON other.id = CASE WHEN cr.concept_a_id = %(id)s THEN cr.concept_b_id ELSE cr.concept_a_id END
                WHERE cr.concept_a_id = %(id)s OR cr.concept_b_id = %(id)s
                ORDER BY cr.cooccurrence_count DESC
            """, {"id": concept_id})
            relations = cursor.fetchall()

    return jsonify({"concept": concept, "relations": relations})


@app.post("/sources")
@require_api_key
def upsert_source():
    payload = request.get_json(silent=True) or {}
    required = ["external_file_id", "file_name", "source_type"]
    missing = [field for field in required if not payload.get(field)]
    if missing:
        return jsonify({"error": "Missing required fields", "fields": missing}), 400

    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("""
                INSERT INTO editorial.sources (
                    external_file_id, file_name, source_type, session_date,
                    drive_url, processing_status, updated_at
                ) VALUES (
                    %(external_file_id)s, %(file_name)s, %(source_type)s,
                    %(session_date)s, %(drive_url)s, %(processing_status)s, NOW()
                )
                ON CONFLICT (external_file_id)
                DO UPDATE SET
                    file_name = EXCLUDED.file_name,
                    source_type = EXCLUDED.source_type,
                    session_date = EXCLUDED.session_date,
                    drive_url = EXCLUDED.drive_url,
                    processing_status = EXCLUDED.processing_status,
                    updated_at = NOW()
                RETURNING *
            """, {
                "external_file_id": payload["external_file_id"],
                "file_name": payload["file_name"],
                "source_type": payload["source_type"],
                "session_date": payload.get("session_date"),
                "drive_url": payload.get("drive_url"),
                "processing_status": payload.get("processing_status", "pending"),
            })
            row = cursor.fetchone()
    return jsonify(row), 201


@app.post("/segments")
@require_api_key
def upsert_segment():
    payload = request.get_json(silent=True) or {}
    required = ["segment_key", "external_file_id", "segment_order", "segment_type", "title", "full_text"]
    missing = [field for field in required if payload.get(field) in (None, "")]
    if missing:
        return jsonify({"error": "Missing required fields", "fields": missing}), 400

    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("SELECT id FROM editorial.sources WHERE external_file_id = %s", (payload["external_file_id"],))
            source = cursor.fetchone()
            if not source:
                return jsonify({"error": "Source not found", "external_file_id": payload["external_file_id"]}), 404

            cursor.execute("SELECT 1 FROM editorial.segment_types WHERE type_key = %s", (payload["segment_type"],))
            if not cursor.fetchone():
                return jsonify({"error": "Unknown segment_type", "segment_type": payload["segment_type"]}), 400

            cursor.execute("SELECT * FROM editorial.content_segments WHERE segment_key = %s", (payload["segment_key"],))
            existing = cursor.fetchone()
            if existing:
                # psycopg2 já desserializa colunas jsonb em listas/dicts Python ao buscar;
                # precisam ser reembrulhadas em Json() para voltar a ser gravadas como jsonb
                # (senão o psycopg2 as adapta como ARRAY do Postgres e a query falha).
                revision_params = dict(existing)
                for jsonb_field in ("keywords", "concepts", "related_themes", "editorial_applications"):
                    revision_params[jsonb_field] = Json(revision_params[jsonb_field])
                cursor.execute("""
                    INSERT INTO editorial.segment_revisions (
                        segment_id, segment_key, segment_order, segment_type, title,
                        executive_summary, full_text, keywords, concepts, related_themes,
                        editorial_applications, editorial_relevance, speaker_type, is_channeled
                    ) VALUES (
                        %(id)s, %(segment_key)s, %(segment_order)s, %(segment_type)s, %(title)s,
                        %(executive_summary)s, %(full_text)s, %(keywords)s, %(concepts)s, %(related_themes)s,
                        %(editorial_applications)s, %(editorial_relevance)s, %(speaker_type)s, %(is_channeled)s
                    )
                """, revision_params)

            speaker_key_lookup = payload.get("speaker_type") or "condutor_sessao"

            embedding_text = "\n\n".join(filter(None, [
                payload["title"], payload.get("executive_summary"), payload["full_text"],
            ]))
            embedding = generate_embedding(embedding_text)

            cursor.execute("""
                INSERT INTO editorial.content_segments (
                    segment_key, source_id, segment_order, segment_type, title,
                    executive_summary, full_text, keywords, concepts,
                    related_themes, editorial_applications, editorial_relevance,
                    speaker_type, is_channeled, speaker_id,
                    embedding, embedding_model, embedding_generated_at, updated_at
                ) VALUES (
                    %(segment_key)s, %(source_id)s, %(segment_order)s, %(segment_type)s,
                    %(title)s, %(executive_summary)s, %(full_text)s, %(keywords)s,
                    %(concepts)s, %(related_themes)s, %(editorial_applications)s,
                    %(editorial_relevance)s, %(speaker_type)s, %(is_channeled)s,
                    (SELECT id FROM editorial.speakers WHERE speaker_key = %(speaker_key_lookup)s),
                    %(embedding)s::vector, %(embedding_model)s, %(embedding_generated_at)s, NOW()
                )
                ON CONFLICT (segment_key)
                DO UPDATE SET
                    segment_order = EXCLUDED.segment_order,
                    segment_type = EXCLUDED.segment_type,
                    title = EXCLUDED.title,
                    executive_summary = EXCLUDED.executive_summary,
                    full_text = EXCLUDED.full_text,
                    keywords = EXCLUDED.keywords,
                    concepts = EXCLUDED.concepts,
                    related_themes = EXCLUDED.related_themes,
                    editorial_applications = EXCLUDED.editorial_applications,
                    editorial_relevance = EXCLUDED.editorial_relevance,
                    speaker_type = EXCLUDED.speaker_type,
                    is_channeled = EXCLUDED.is_channeled,
                    speaker_id = EXCLUDED.speaker_id,
                    embedding = EXCLUDED.embedding,
                    embedding_model = EXCLUDED.embedding_model,
                    embedding_generated_at = EXCLUDED.embedding_generated_at,
                    updated_at = NOW()
                RETURNING *
            """, {
                "segment_key": payload["segment_key"],
                "source_id": source["id"],
                "segment_order": payload["segment_order"],
                "segment_type": payload["segment_type"],
                "title": payload["title"],
                "executive_summary": payload.get("executive_summary"),
                "full_text": payload["full_text"],
                "keywords": Json(payload.get("keywords", [])),
                "concepts": Json(payload.get("concepts", [])),
                "related_themes": Json(payload.get("related_themes", [])),
                "editorial_applications": Json(payload.get("editorial_applications", [])),
                "editorial_relevance": payload.get("editorial_relevance", 0),
                "speaker_type": payload.get("speaker_type"),
                "is_channeled": bool(payload.get("is_channeled", False)),
                "speaker_key_lookup": speaker_key_lookup,
                "embedding": embedding,
                "embedding_model": EMBEDDING_MODEL if embedding else None,
                "embedding_generated_at": datetime.now(timezone.utc) if embedding else None,
            })
            row = cursor.fetchone()

            sync_concepts(cursor, payload.get("concepts", []), segment_id=row["id"])
            cursor.execute("SELECT editorial.recalculate_concept_graph()")

    return jsonify(strip_embedding(row)), 201


@app.get("/segments")
@require_api_key
def list_segments():
    theme = request.args.get("theme")
    segment_type = request.args.get("type")
    channeled = request.args.get("channeled")
    concept = request.args.get("concept")
    limit = min(request.args.get("limit", default=50, type=int), 500)

    clauses = []
    parameters = []
    if theme:
        clauses.append("cs.related_themes ? %s")
        parameters.append(theme)
    if segment_type:
        clauses.append("cs.segment_type = %s")
        parameters.append(segment_type)
    if channeled is not None:
        clauses.append("cs.is_channeled = %s")
        parameters.append(channeled.lower() == "true")
    if concept:
        clauses.append(f"""
            cs.id IN (
                SELECT sc.segment_id FROM editorial.segment_concepts sc
                JOIN editorial.concepts co ON co.id = sc.concept_id
                WHERE co.normalized_key = {NORMALIZE_CONCEPT_KEY_SQL}
            )
        """)
        parameters.append(concept)

    where = "WHERE " + " AND ".join(clauses) if clauses else ""
    parameters.append(limit)

    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(f"""
                SELECT cs.*, s.external_file_id, s.file_name AS source_file_name, s.session_date
                FROM editorial.content_segments cs
                JOIN editorial.sources s ON s.id = cs.source_id
                {where}
                ORDER BY cs.editorial_relevance DESC, s.session_date, cs.segment_order
                LIMIT %s
            """, parameters)
            rows = cursor.fetchall()
    return jsonify([strip_embedding(row) for row in rows])


@app.get("/segments/<segment_id>")
@require_api_key
def get_segment(segment_id):
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("""
                SELECT cs.*, s.external_file_id, s.file_name AS source_file_name, s.session_date
                FROM editorial.content_segments cs
                JOIN editorial.sources s ON s.id = cs.source_id
                WHERE cs.id = %s
            """, (segment_id,))
            row = cursor.fetchone()
    if not row:
        return jsonify({"error": "Segment not found"}), 404
    return jsonify(strip_embedding(row))


@app.post("/knowledge-cards")
@require_api_key
def upsert_knowledge_card():
    payload = request.get_json(silent=True) or {}
    required = ["card_key", "external_file_id", "theme_key", "title", "summary", "relevance_score"]
    missing = [field for field in required if payload.get(field) is None]
    if missing:
        return jsonify({"error": "Missing required fields", "fields": missing}), 400

    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("SELECT id FROM editorial.sources WHERE external_file_id = %s", (payload["external_file_id"],))
            source = cursor.fetchone()
            if not source:
                return jsonify({"error": "Source not found", "external_file_id": payload["external_file_id"]}), 404

            cursor.execute("SELECT id FROM editorial.themes WHERE theme_key = %s AND active = TRUE", (payload["theme_key"],))
            theme = cursor.fetchone()
            if not theme:
                return jsonify({"error": "Active theme not found", "theme_key": payload["theme_key"]}), 404

            segment_id = None
            if payload.get("segment_key"):
                cursor.execute("SELECT id FROM editorial.content_segments WHERE segment_key = %s", (payload["segment_key"],))
                segment = cursor.fetchone()
                if segment:
                    segment_id = segment["id"]

            cursor.execute("SELECT * FROM editorial.knowledge_cards WHERE card_key = %s", (payload["card_key"],))
            existing = cursor.fetchone()
            if existing:
                # ver comentário equivalente em upsert_segment: jsonb já vem desserializado
                # do psycopg2, precisa ser reembrulhado em Json() antes de regravar.
                revision_params = dict(existing)
                for jsonb_field in ("concepts", "principles", "quotes", "evidence"):
                    revision_params[jsonb_field] = Json(revision_params[jsonb_field])
                cursor.execute("""
                    INSERT INTO editorial.card_revisions (
                        card_id, card_key, title, summary, concepts, principles,
                        quotes, evidence, relevance_score
                    ) VALUES (
                        %(id)s, %(card_key)s, %(title)s, %(summary)s, %(concepts)s, %(principles)s,
                        %(quotes)s, %(evidence)s, %(relevance_score)s
                    )
                """, revision_params)

            embedding_text = "\n\n".join(filter(None, [payload["title"], payload["summary"]]))
            embedding = generate_embedding(embedding_text)

            cursor.execute("""
                INSERT INTO editorial.knowledge_cards (
                    card_key, source_id, theme_id, segment_id, block_number,
                    title, summary, concepts, principles, quotes, evidence,
                    relevance_score, embedding, embedding_model, embedding_generated_at, updated_at
                ) VALUES (
                    %(card_key)s, %(source_id)s, %(theme_id)s, %(segment_id)s,
                    %(block_number)s, %(title)s, %(summary)s, %(concepts)s,
                    %(principles)s, %(quotes)s, %(evidence)s,
                    %(relevance_score)s, %(embedding)s::vector, %(embedding_model)s, %(embedding_generated_at)s, NOW()
                )
                ON CONFLICT (card_key)
                DO UPDATE SET
                    segment_id = EXCLUDED.segment_id,
                    title = EXCLUDED.title,
                    summary = EXCLUDED.summary,
                    concepts = EXCLUDED.concepts,
                    principles = EXCLUDED.principles,
                    quotes = EXCLUDED.quotes,
                    evidence = EXCLUDED.evidence,
                    relevance_score = EXCLUDED.relevance_score,
                    embedding = EXCLUDED.embedding,
                    embedding_model = EXCLUDED.embedding_model,
                    embedding_generated_at = EXCLUDED.embedding_generated_at,
                    updated_at = NOW()
                RETURNING *
            """, {
                "card_key": payload["card_key"],
                "source_id": source["id"],
                "theme_id": theme["id"],
                "segment_id": segment_id,
                "block_number": payload.get("block_number"),
                "title": payload["title"],
                "summary": payload["summary"],
                "concepts": Json(payload.get("concepts", [])),
                "principles": Json(payload.get("principles", [])),
                "quotes": Json(payload.get("quotes", [])),
                "evidence": Json(payload.get("evidence", [])),
                "relevance_score": payload["relevance_score"],
                "embedding": embedding,
                "embedding_model": EMBEDDING_MODEL if embedding else None,
                "embedding_generated_at": datetime.now(timezone.utc) if embedding else None,
            })
            row = cursor.fetchone()

            sync_concepts(cursor, payload.get("concepts", []), card_id=row["id"])
            cursor.execute("SELECT editorial.recalculate_concept_graph()")

    return jsonify(strip_embedding(row)), 201


@app.get("/knowledge-cards")
@require_api_key
def list_knowledge_cards():
    theme_key = request.args.get("theme")
    concept = request.args.get("concept")
    limit = min(request.args.get("limit", default=50, type=int), 500)
    clauses = []
    parameters = []
    if theme_key:
        clauses.append("t.theme_key = %s")
        parameters.append(theme_key)
    if concept:
        clauses.append(f"""
            kc.id IN (
                SELECT cc.card_id FROM editorial.card_concepts cc
                JOIN editorial.concepts co ON co.id = cc.concept_id
                WHERE co.normalized_key = {NORMALIZE_CONCEPT_KEY_SQL}
            )
        """)
        parameters.append(concept)
    where = "WHERE " + " AND ".join(clauses) if clauses else ""
    parameters.append(limit)

    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(f"""
                SELECT
                    kc.id, kc.card_key, kc.title, kc.summary, kc.concepts,
                    kc.principles, kc.quotes, kc.evidence, kc.relevance_score,
                    kc.importance_score, kc.importance_level, kc.segment_id,
                    s.external_file_id, s.file_name AS source_file_name,
                    s.session_date, t.theme_key, t.name AS theme_name
                FROM editorial.knowledge_cards kc
                JOIN editorial.sources s ON s.id = kc.source_id
                JOIN editorial.themes t ON t.id = kc.theme_id
                {where}
                ORDER BY kc.importance_score DESC, kc.created_at DESC
                LIMIT %s
            """, parameters)
            rows = cursor.fetchall()
    return jsonify(rows)


@app.post("/reindex-embeddings")
@require_api_key
def reindex_embeddings():
    """Gera embeddings para segmentos/fichas que ainda não têm (backfill de dados
    anteriores à ADR-012, ou reprocessamento se o modelo de embedding mudar no futuro).
    Passe {"force": true} para regerar mesmo os que já têm embedding."""
    payload = request.get_json(silent=True) or {}
    force = bool(payload.get("force", False))
    limit = min(int(payload.get("limit", 200)), 500)

    updated = {"segments": 0, "knowledge_cards": 0}
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            where = "" if force else "WHERE embedding IS NULL"
            cursor.execute(f"""
                SELECT id, title, executive_summary, full_text
                FROM editorial.content_segments
                {where}
                ORDER BY created_at
                LIMIT %s
            """, (limit,))
            segments = cursor.fetchall()

            for segment in segments:
                text = "\n\n".join(filter(None, [
                    segment["title"], segment["executive_summary"], segment["full_text"],
                ]))
                embedding = generate_embedding(text)
                if embedding is None:
                    continue
                cursor.execute("""
                    UPDATE editorial.content_segments
                    SET embedding = %s::vector, embedding_model = %s, embedding_generated_at = NOW()
                    WHERE id = %s
                """, (embedding, EMBEDDING_MODEL, segment["id"]))
                updated["segments"] += 1

            cursor.execute(f"""
                SELECT id, title, summary
                FROM editorial.knowledge_cards
                {where}
                ORDER BY created_at
                LIMIT %s
            """, (limit,))
            cards = cursor.fetchall()

            for card in cards:
                text = "\n\n".join(filter(None, [card["title"], card["summary"]]))
                embedding = generate_embedding(text)
                if embedding is None:
                    continue
                cursor.execute("""
                    UPDATE editorial.knowledge_cards
                    SET embedding = %s::vector, embedding_model = %s, embedding_generated_at = NOW()
                    WHERE id = %s
                """, (embedding, EMBEDDING_MODEL, card["id"]))
                updated["knowledge_cards"] += 1

    return jsonify(updated)


@app.post("/search")
@require_api_key
def semantic_search():
    """Busca semântica (ADR-012 §5): embeda a consulta e ranqueia segmentos/fichas por
    similaridade de cosseno. Não substitui os filtros exatos de /segments e /knowledge-cards,
    complementa quando a mesma ideia aparece com vocabulário diferente ao longo do acervo."""
    payload = request.get_json(silent=True) or {}
    query = (payload.get("query") or "").strip()
    if not query:
        return jsonify({"error": "Missing required field", "fields": ["query"]}), 400

    limit = min(int(payload.get("limit", 10)), 50)
    include = payload.get("include") or ["segments", "knowledge_cards"]

    query_embedding = generate_embedding(query)
    if query_embedding is None:
        return jsonify({"error": "Failed to generate embedding for query"}), 502

    results = []
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            if "segments" in include:
                cursor.execute("""
                    SELECT
                        'segment' AS result_type, cs.id, cs.title, cs.executive_summary,
                        cs.segment_type, cs.editorial_relevance, cs.is_channeled,
                        s.external_file_id, s.file_name AS source_file_name, s.session_date,
                        1 - (cs.embedding <=> %(embedding)s::vector) AS similarity
                    FROM editorial.content_segments cs
                    JOIN editorial.sources s ON s.id = cs.source_id
                    WHERE cs.embedding IS NOT NULL
                    ORDER BY cs.embedding <=> %(embedding)s::vector
                    LIMIT %(limit)s
                """, {"embedding": query_embedding, "limit": limit})
                results.extend(cursor.fetchall())

            if "knowledge_cards" in include:
                cursor.execute("""
                    SELECT
                        'knowledge_card' AS result_type, kc.id, kc.title, kc.summary,
                        kc.importance_score, kc.importance_level,
                        s.external_file_id, s.file_name AS source_file_name, s.session_date,
                        1 - (kc.embedding <=> %(embedding)s::vector) AS similarity
                    FROM editorial.knowledge_cards kc
                    JOIN editorial.sources s ON s.id = kc.source_id
                    WHERE kc.embedding IS NOT NULL
                    ORDER BY kc.embedding <=> %(embedding)s::vector
                    LIMIT %(limit)s
                """, {"embedding": query_embedding, "limit": limit})
                results.extend(cursor.fetchall())

    results.sort(key=lambda item: item["similarity"], reverse=True)
    return jsonify(results[:limit])


@app.post("/book-projects")
@require_api_key
def create_book_project():
    payload = request.get_json(silent=True) or {}
    if not payload.get("title"):
        return jsonify({"error": "Missing required fields", "fields": ["title"]}), 400

    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("""
                INSERT INTO editorial.book_projects (title, description)
                VALUES (%s, %s)
                RETURNING *
            """, (payload["title"], payload.get("description")))
            row = cursor.fetchone()
    return jsonify(row), 201


@app.get("/book-projects")
@require_api_key
def list_book_projects():
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("""
                SELECT bp.*, count(ch.id) AS chapter_count
                FROM editorial.book_projects bp
                LEFT JOIN editorial.chapters ch ON ch.book_project_id = bp.id
                GROUP BY bp.id
                ORDER BY bp.created_at DESC
            """)
            rows = cursor.fetchall()
    return jsonify(rows)


@app.get("/book-projects/<book_project_id>")
@require_api_key
def get_book_project(book_project_id):
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("SELECT * FROM editorial.book_projects WHERE id = %s", (book_project_id,))
            project = cursor.fetchone()
            if not project:
                return jsonify({"error": "Book project not found"}), 404

            cursor.execute("""
                SELECT ch.id, ch.chapter_order, ch.title, ch.status, ch.thematic_scope,
                       count(cs.id) AS source_count
                FROM editorial.chapters ch
                LEFT JOIN editorial.chapter_sources cs ON cs.chapter_id = ch.id
                WHERE ch.book_project_id = %s
                GROUP BY ch.id
                ORDER BY ch.chapter_order
            """, (book_project_id,))
            project["chapters"] = cursor.fetchall()
    return jsonify(project)


@app.post("/book-projects/<book_project_id>/chapters")
@require_api_key
def create_chapter(book_project_id):
    payload = request.get_json(silent=True) or {}
    required = ["title", "chapter_order"]
    missing = [field for field in required if payload.get(field) in (None, "")]
    if missing:
        return jsonify({"error": "Missing required fields", "fields": missing}), 400

    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("SELECT id FROM editorial.book_projects WHERE id = %s", (book_project_id,))
            if not cursor.fetchone():
                return jsonify({"error": "Book project not found"}), 404

            concept_ids = []
            unknown_concepts = []
            for name in payload.get("thematic_scope", []):
                cursor.execute(
                    f"SELECT id FROM editorial.concepts WHERE normalized_key = {NORMALIZE_CONCEPT_KEY_SQL}",
                    (name,),
                )
                row = cursor.fetchone()
                if row:
                    concept_ids.append(str(row["id"]))
                else:
                    unknown_concepts.append(name)
            if unknown_concepts:
                return jsonify({"error": "Unknown concepts", "concepts": unknown_concepts}), 400

            cursor.execute("""
                INSERT INTO editorial.chapters (book_project_id, chapter_order, title, thematic_scope)
                VALUES (%s, %s, %s, %s)
                RETURNING *
            """, (book_project_id, payload["chapter_order"], payload["title"], Json(concept_ids)))
            chapter = cursor.fetchone()
    return jsonify(chapter), 201


@app.get("/chapters/<chapter_id>")
@require_api_key
def get_chapter(chapter_id):
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            chapter = build_chapter_detail(cursor, chapter_id)
    if not chapter:
        return jsonify({"error": "Chapter not found"}), 404
    return jsonify(chapter)


@app.post("/chapters/<chapter_id>/propose")
@require_api_key
def propose_chapter_sources(chapter_id):
    """Módulo 06 (ADR-013 §3): gera uma PROPOSTA de montagem, não uma versão final.
    Recupera candidatos por conceito (Mapa Filosófico), ranqueia e remove redundância
    por similaridade de embedding. Sempre grava como proposta — o capítulo permanece em
    'draft' até aprovação humana explícita via POST /chapters/<id>/approve."""
    payload = request.get_json(silent=True) or {}
    min_importance = int(payload.get("min_importance", 25))
    limit = min(int(payload.get("limit", 20)), 50)
    similarity_threshold = float(payload.get("similarity_threshold", 0.92))

    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("SELECT * FROM editorial.chapters WHERE id = %s", (chapter_id,))
            chapter = cursor.fetchone()
            if not chapter:
                return jsonify({"error": "Chapter not found"}), 404

            concept_ids = chapter["thematic_scope"] or []
            if not concept_ids:
                return jsonify({"error": "Chapter has empty thematic_scope"}), 400

            cursor.execute("""
                SELECT DISTINCT cs.id AS segment_id, cs.is_channeled, cs.editorial_relevance, cs.embedding
                FROM editorial.content_segments cs
                JOIN editorial.segment_concepts sc ON sc.segment_id = cs.id
                WHERE sc.concept_id = ANY(%s::uuid[])
                ORDER BY cs.is_channeled DESC, cs.editorial_relevance DESC
                LIMIT %s
            """, (concept_ids, limit * 2))
            segment_candidates = cursor.fetchall()

            cursor.execute("""
                SELECT DISTINCT kc.id AS card_id, kc.importance_score, kc.embedding
                FROM editorial.knowledge_cards kc
                JOIN editorial.card_concepts cc ON cc.card_id = kc.id
                WHERE cc.concept_id = ANY(%s::uuid[]) AND kc.importance_score >= %s
                ORDER BY kc.importance_score DESC
                LIMIT %s
            """, (concept_ids, min_importance, limit * 2))
            card_candidates = cursor.fetchall()

            kept = []
            kept_embeddings = []

            def try_keep(kind, item_id, embedding):
                if len(kept) >= limit:
                    return
                if embedding is not None and any(
                    cosine_similarity(embedding, other) >= similarity_threshold for other in kept_embeddings
                ):
                    return
                kept.append((kind, item_id))
                kept_embeddings.append(embedding)

            for row in segment_candidates:
                try_keep("segment", row["segment_id"], row["embedding"])
            for row in card_candidates:
                try_keep("card", row["card_id"], row["embedding"])

            snapshot_chapter_revision(
                cursor, chapter,
                _fetch_chapter_sources(cursor, chapter_id),
            )

            for order, (kind, item_id) in enumerate(kept, start=1):
                if kind == "segment":
                    cursor.execute("""
                        INSERT INTO editorial.chapter_sources (chapter_id, segment_id, source_order, inclusion_type)
                        VALUES (%s, %s, %s, 'literal_segment')
                    """, (chapter_id, item_id, order))
                else:
                    cursor.execute("""
                        INSERT INTO editorial.chapter_sources
                            (chapter_id, knowledge_card_id, source_order, inclusion_type)
                        VALUES (%s, %s, %s, 'card_synthesis')
                    """, (chapter_id, item_id, order))

            cursor.execute("UPDATE editorial.chapters SET updated_at = NOW() WHERE id = %s", (chapter_id,))
            result = build_chapter_detail(cursor, chapter_id)
    return jsonify(result)


@app.put("/chapters/<chapter_id>/sources")
@require_api_key
def set_chapter_sources(chapter_id):
    """Substituição manual das fontes de um capítulo — para quando um humano quer
    ajustar/curar a proposta gerada por /propose antes de aprovar."""
    payload = request.get_json(silent=True) or {}
    sources = payload.get("sources")
    if not isinstance(sources, list) or not sources:
        return jsonify({"error": "Missing required field", "fields": ["sources"]}), 400

    for item in sources:
        inclusion_type = item.get("inclusion_type")
        if inclusion_type not in ("literal_segment", "card_synthesis", "transition_context"):
            return jsonify({"error": "Invalid inclusion_type", "value": inclusion_type}), 400
        if inclusion_type == "literal_segment" and not item.get("segment_id"):
            return jsonify({"error": "literal_segment requires segment_id"}), 400
        if inclusion_type == "card_synthesis" and not item.get("knowledge_card_id"):
            return jsonify({"error": "card_synthesis requires knowledge_card_id"}), 400

    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("SELECT * FROM editorial.chapters WHERE id = %s", (chapter_id,))
            chapter = cursor.fetchone()
            if not chapter:
                return jsonify({"error": "Chapter not found"}), 404

            snapshot_chapter_revision(
                cursor, chapter,
                _fetch_chapter_sources(cursor, chapter_id),
            )

            for order, item in enumerate(sources, start=1):
                cursor.execute("""
                    INSERT INTO editorial.chapter_sources
                        (chapter_id, segment_id, knowledge_card_id, source_order, inclusion_type, content)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (
                    chapter_id, item.get("segment_id"), item.get("knowledge_card_id"),
                    order, item["inclusion_type"], item.get("content"),
                ))

            cursor.execute("UPDATE editorial.chapters SET updated_at = NOW() WHERE id = %s", (chapter_id,))
            result = build_chapter_detail(cursor, chapter_id)
    return jsonify(result)


@app.post("/chapters/<chapter_id>/approve")
@require_api_key
def approve_chapter(chapter_id):
    """Gate de aprovação humana (ADR-013 §3.4): só um humano avança um capítulo de
    'draft' para 'assembled'. Nunca automatizar esta chamada."""
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("SELECT * FROM editorial.chapters WHERE id = %s", (chapter_id,))
            chapter = cursor.fetchone()
            if not chapter:
                return jsonify({"error": "Chapter not found"}), 404
            if chapter["status"] != "draft":
                return jsonify({"error": "Chapter is not in draft status", "status": chapter["status"]}), 400

            cursor.execute("SELECT count(*) AS n FROM editorial.chapter_sources WHERE chapter_id = %s", (chapter_id,))
            if cursor.fetchone()["n"] == 0:
                return jsonify({"error": "Chapter has no sources to approve"}), 400

            cursor.execute("""
                UPDATE editorial.chapters SET status = 'assembled', updated_at = NOW()
                WHERE id = %s
            """, (chapter_id,))
            result = build_chapter_detail(cursor, chapter_id)
    return jsonify(result)


@app.get("/chapters/<chapter_id>/consolidation-check")
@require_api_key
def consolidation_check(chapter_id):
    """Checklist de consolidação (ADR-014 §2) — sempre um relatório informativo,
    nunca bloqueia nada sozinho. A decisão de avançar para 'reviewed' é sempre humana."""
    paraphrase_threshold = float(request.args.get("paraphrase_threshold", 0.85))

    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            chapter = build_chapter_detail(cursor, chapter_id)
            if not chapter:
                return jsonify({"error": "Chapter not found"}), 404

            sources = chapter["sources"]
            issues = []

            # 1. a mesma fonte usada mais de uma vez dentro do proprio capitulo
            seen = {}
            for source in sources:
                if source["segment_id"]:
                    key = ("segment", source["segment_id"])
                elif source["knowledge_card_id"]:
                    key = ("card", source["knowledge_card_id"])
                else:
                    continue
                seen.setdefault(key, []).append(source["id"])
            for (kind, item_id), ids in seen.items():
                if len(ids) > 1:
                    issues.append({
                        "type": "duplicate_source_in_chapter",
                        "detail": f"{kind} {item_id} aparece {len(ids)} vezes neste capítulo",
                        "chapter_source_ids": [str(i) for i in ids],
                    })

            # 2. terminologia nao-canonica em texto de transicao escrito manualmente
            cursor.execute("""
                SELECT canonical_name, aliases FROM editorial.concepts
                WHERE jsonb_array_length(aliases) > 0
            """)
            concepts_with_aliases = cursor.fetchall()
            for source in sources:
                if source["inclusion_type"] == "transition_context" and source["content"]:
                    text_lower = source["content"].lower()
                    for concept in concepts_with_aliases:
                        canonical_lower = concept["canonical_name"].lower()
                        for alias in concept["aliases"]:
                            if alias.lower() in text_lower and canonical_lower not in text_lower:
                                issues.append({
                                    "type": "non_canonical_terminology",
                                    "chapter_source_id": str(source["id"]),
                                    "alias_found": alias,
                                    "canonical_name": concept["canonical_name"],
                                })

            # 3. possivel parafrase de bloco literal adjacente
            for index, source in enumerate(sources):
                if source["inclusion_type"] != "transition_context" or not source["content"]:
                    continue
                embedding = generate_embedding(source["content"])
                if embedding is None:
                    continue
                neighbors = [sources[index - 1] if index > 0 else None,
                             sources[index + 1] if index + 1 < len(sources) else None]
                for neighbor in neighbors:
                    if not neighbor or neighbor["inclusion_type"] != "literal_segment" or not neighbor["segment_id"]:
                        continue
                    cursor.execute("""
                        SELECT 1 - (embedding <=> %s::vector) AS similarity
                        FROM editorial.content_segments
                        WHERE id = %s AND embedding IS NOT NULL
                    """, (embedding, neighbor["segment_id"]))
                    row = cursor.fetchone()
                    if row and row["similarity"] >= paraphrase_threshold:
                        issues.append({
                            "type": "possible_paraphrase",
                            "chapter_source_id": str(source["id"]),
                            "adjacent_segment_id": str(neighbor["segment_id"]),
                            "similarity": row["similarity"],
                        })

    return jsonify({
        "chapter_id": chapter_id,
        "issues": issues,
        "note": (
            "Canalização cortada no meio entre dois chapter_sources não é verificado "
            "aqui porque é estruturalmente impossível: cada linha de chapter_sources "
            "referencia um segmento inteiro, nunca um trecho parcial."
        ),
    })


@app.get("/book-projects/<book_project_id>/duplicate-report")
@require_api_key
def duplicate_report(book_project_id):
    """Detecção de duplicidade entre capítulos do mesmo projeto (ADR-014 §1).
    Só sinaliza — nunca remove ou realoca nada automaticamente."""
    threshold = float(request.args.get("threshold", 0.90))

    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("SELECT id FROM editorial.book_projects WHERE id = %s", (book_project_id,))
            if not cursor.fetchone():
                return jsonify({"error": "Book project not found"}), 404

            cursor.execute("""
                WITH proj_sources AS (
                    SELECT
                        cs.id, cs.chapter_id, cs.segment_id, cs.knowledge_card_id,
                        COALESCE(seg.embedding, card.embedding) AS embedding,
                        COALESCE(seg.title, card.title) AS title
                    FROM editorial.chapter_sources cs
                    JOIN editorial.chapters ch ON ch.id = cs.chapter_id
                    LEFT JOIN editorial.content_segments seg ON seg.id = cs.segment_id
                    LEFT JOIN editorial.knowledge_cards card ON card.id = cs.knowledge_card_id
                    WHERE ch.book_project_id = %(book_project_id)s
                )
                SELECT
                    a.chapter_id AS chapter_a_id, b.chapter_id AS chapter_b_id,
                    a.id AS source_a_id, b.id AS source_b_id,
                    a.title AS title_a, b.title AS title_b,
                    1 - (a.embedding <=> b.embedding) AS similarity
                FROM proj_sources a
                JOIN proj_sources b ON a.id < b.id AND a.chapter_id <> b.chapter_id
                WHERE a.embedding IS NOT NULL AND b.embedding IS NOT NULL
                  AND 1 - (a.embedding <=> b.embedding) >= %(threshold)s
                ORDER BY similarity DESC
            """, {"book_project_id": book_project_id, "threshold": threshold})
            conflicts = cursor.fetchall()

    return jsonify({"book_project_id": book_project_id, "threshold": threshold, "conflicts": conflicts})


@app.post("/chapters/<chapter_id>/review")
@require_api_key
def review_chapter(chapter_id):
    """Gate de aprovação humana (ADR-014 §3): só avança de 'assembled' para 'reviewed'
    com reviewed_by preenchido. Nunca deve ser chamado por um processo automático."""
    payload = request.get_json(silent=True) or {}
    reviewed_by = payload.get("reviewed_by")
    if not reviewed_by:
        return jsonify({"error": "Missing required fields", "fields": ["reviewed_by"]}), 400

    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("SELECT * FROM editorial.chapters WHERE id = %s", (chapter_id,))
            chapter = cursor.fetchone()
            if not chapter:
                return jsonify({"error": "Chapter not found"}), 404
            if chapter["status"] != "assembled":
                return jsonify({
                    "error": "Chapter must be 'assembled' before it can be reviewed",
                    "status": chapter["status"],
                }), 400

            cursor.execute("""
                UPDATE editorial.chapters
                SET status = 'reviewed', reviewed_by = %s, reviewed_at = NOW(), updated_at = NOW()
                WHERE id = %s
            """, (reviewed_by, chapter_id))
            result = build_chapter_detail(cursor, chapter_id)
    return jsonify(result)


@app.errorhandler(Exception)
def handle_unexpected_error(error):
    app.logger.exception("Unexpected error")
    return jsonify({"error": "Internal server error", "message": str(error)}), 500
