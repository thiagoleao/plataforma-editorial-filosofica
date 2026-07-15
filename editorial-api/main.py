import hmac
import os
from functools import wraps

import psycopg2
from flask import Flask, jsonify, request
from psycopg2.extras import Json, RealDictCursor

app = Flask(__name__)

INSTANCE_CONNECTION_NAME = os.environ["INSTANCE_CONNECTION_NAME"]
DB_NAME = os.environ.get("DB_NAME", "plataforma_editorial_filosofica")
DB_USER = os.environ.get("DB_USER", "editorial_app")
DB_PASSWORD = os.environ["DB_PASSWORD"]
SERVICE_API_KEY = os.environ["SERVICE_API_KEY"]


def get_connection():
    return psycopg2.connect(
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        host=f"/cloudsql/{INSTANCE_CONNECTION_NAME}",
        connect_timeout=10,
    )


def require_api_key(function):
    @wraps(function)
    def decorated(*args, **kwargs):
        supplied_key = request.headers.get("X-Service-Api-Key", "")
        if not supplied_key or not hmac.compare_digest(supplied_key, SERVICE_API_KEY):
            return jsonify({"error": "Invalid service API key"}), 401
        return function(*args, **kwargs)
    return decorated


NORMALIZE_CONCEPT_KEY_SQL = "editorial.immutable_unaccent(lower(regexp_replace(trim(%s), '[-_]+', ' ', 'g')))"


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
                    COUNT(DISTINCT sc.segment_id) AS segment_count,
                    COUNT(DISTINCT cc.card_id) AS card_count
                FROM editorial.concepts c
                LEFT JOIN editorial.segment_concepts sc ON sc.concept_id = c.id
                LEFT JOIN editorial.card_concepts cc ON cc.concept_id = c.id
                GROUP BY c.id
                ORDER BY (COUNT(DISTINCT sc.segment_id) + COUNT(DISTINCT cc.card_id)) DESC, c.canonical_name
                LIMIT %s
            """, (limit,))
            rows = cursor.fetchall()
    return jsonify(rows)


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
                """, existing)

            speaker_key_lookup = payload.get("speaker_type") or "condutor_sessao"

            cursor.execute("""
                INSERT INTO editorial.content_segments (
                    segment_key, source_id, segment_order, segment_type, title,
                    executive_summary, full_text, keywords, concepts,
                    related_themes, editorial_applications, editorial_relevance,
                    speaker_type, is_channeled, speaker_id, updated_at
                ) VALUES (
                    %(segment_key)s, %(source_id)s, %(segment_order)s, %(segment_type)s,
                    %(title)s, %(executive_summary)s, %(full_text)s, %(keywords)s,
                    %(concepts)s, %(related_themes)s, %(editorial_applications)s,
                    %(editorial_relevance)s, %(speaker_type)s, %(is_channeled)s,
                    (SELECT id FROM editorial.speakers WHERE speaker_key = %(speaker_key_lookup)s), NOW()
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
            })
            row = cursor.fetchone()

            sync_concepts(cursor, payload.get("concepts", []), segment_id=row["id"])

    return jsonify(row), 201


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
    return jsonify(rows)


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
    return jsonify(row)


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
                cursor.execute("""
                    INSERT INTO editorial.card_revisions (
                        card_id, card_key, title, summary, concepts, principles,
                        quotes, evidence, relevance_score
                    ) VALUES (
                        %(id)s, %(card_key)s, %(title)s, %(summary)s, %(concepts)s, %(principles)s,
                        %(quotes)s, %(evidence)s, %(relevance_score)s
                    )
                """, existing)

            cursor.execute("""
                INSERT INTO editorial.knowledge_cards (
                    card_key, source_id, theme_id, segment_id, block_number,
                    title, summary, concepts, principles, quotes, evidence,
                    relevance_score, updated_at
                ) VALUES (
                    %(card_key)s, %(source_id)s, %(theme_id)s, %(segment_id)s,
                    %(block_number)s, %(title)s, %(summary)s, %(concepts)s,
                    %(principles)s, %(quotes)s, %(evidence)s,
                    %(relevance_score)s, NOW()
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
            })
            row = cursor.fetchone()

            sync_concepts(cursor, payload.get("concepts", []), card_id=row["id"])

    return jsonify(row), 201


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


@app.errorhandler(Exception)
def handle_unexpected_error(error):
    app.logger.exception("Unexpected error")
    return jsonify({"error": "Internal server error", "message": str(error)}), 500
