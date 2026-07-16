"""Reprocessamento em lote das fichas existentes com o novo prompt de síntese (ADR-022 §1).

Script de uso único (backfill), não uma automação recorrente. Lê OPENAI_API_KEY e
EDITORIAL_API_KEY do ambiente (nunca hardcoded, nunca logado). Para cada ficha
existente, regenera via o mesmo prompt agora publicado no node "Avaliar tema e
gerar ficha" do Fluxo 02 (n8n), e faz upsert via POST /knowledge-cards usando o
mesmo card_key -- o próprio endpoint já preserva a versão anterior em
card_revisions (main.py, upsert_knowledge_card). Fichas onde o novo julgamento
do modelo é create_card=false NUNCA são apagadas ou sobrescritas -- só entram
no relatório final para revisão humana.
"""

import json
import os
import sys
import time

import requests
from openai import OpenAI

API_BASE = "https://editorial-api-592824114603.southamerica-east1.run.app"
CHAT_MODEL = "gpt-4o-mini"

SYSTEM_PROMPT = """Você é um arquivista editorial rigoroso. Analise somente o segmento fornecido. Nunca use conhecimento externo, nunca complete lacunas e nunca invente ensinamentos. Uma simples menção ao tema não é suficiente. Só marque create_card=true quando houver conteúdo explícito, desenvolvido e editorialmente útil sobre o tema.

Quando create_card=true, o campo summary é uma síntese em português fluente e corrigido (nunca uma cópia do texto literal) que segue sempre este arco: (1) gancho/contexto — o que motivou a fala ou de onde ela parte; (2) desenvolvimento — o raciocínio central, com seus passos; (3) conclusão/insight — a ideia de fechamento. Não são seções rotuladas nem uma lista — é prosa corrida que percorre esse arco. summary nunca contém citação literal entre aspas do segmento — toda citação literal vai exclusivamente em quotes/evidence, nunca misturada dentro da paráfrase.

Retorne SOMENTE JSON válido, sem markdown, no formato {"create_card":false,"relevance_score":0,"title":"","summary":"","concepts":[],"principles":[],"quotes":[],"evidence":[]}. Se create_card=true: title deve ter 3 a 10 palavras; summary deve seguir o arco gancho/desenvolvimento/conclusão descrito acima, sem citação literal embutida; quotes deve conter 1 a 2 trechos literais do segmento que sustentam a síntese (frases completas, não fragmentos soltos); evidence deve conter trechos literais adicionais de apoio, se houver."""

USER_PROMPT_TEMPLATE = """Tema: {theme_name}
Definição: {theme_description}
Relevância mínima: {minimum_relevance}
Segmento: {segment_title}
Tipo: {segment_type}

Texto literal do segmento:
{segment_text}"""


def api_headers(api_key):
    return {"X-Service-Api-Key": api_key, "Content-Type": "application/json"}


def fetch_all_cards(api_key):
    resp = requests.get(f"{API_BASE}/knowledge-cards", headers=api_headers(api_key), params={"limit": 500})
    resp.raise_for_status()
    return resp.json()


def fetch_segment(api_key, segment_id):
    resp = requests.get(f"{API_BASE}/segments/{segment_id}", headers=api_headers(api_key))
    resp.raise_for_status()
    return resp.json()


def fetch_themes(api_key):
    resp = requests.get(f"{API_BASE}/themes", headers=api_headers(api_key))
    resp.raise_for_status()
    return {t["theme_key"]: t for t in resp.json()}


def regenerate(openai_client, theme, segment):
    user_prompt = USER_PROMPT_TEMPLATE.format(
        theme_name=theme["name"],
        theme_description=theme["description"],
        minimum_relevance=theme["minimum_relevance"],
        segment_title=segment["title"],
        segment_type=segment["segment_type"],
        segment_text=segment["full_text"],
    )
    response = openai_client.chat.completions.create(
        model=CHAT_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"},
    )
    return json.loads(response.choices[0].message.content)


def upsert_card(api_key, card, result, segment):
    payload = {
        "card_key": card["card_key"],
        "external_file_id": card["external_file_id"],
        "theme_key": card["theme_key"],
        "segment_key": segment["segment_key"],
        "title": result["title"],
        "summary": result["summary"],
        "concepts": result.get("concepts", []),
        "principles": result.get("principles", []),
        "quotes": result.get("quotes", []),
        "evidence": result.get("evidence", []),
        "relevance_score": result["relevance_score"],
    }
    resp = requests.post(f"{API_BASE}/knowledge-cards", headers=api_headers(api_key), json=payload)
    resp.raise_for_status()
    return resp.json()


def main():
    openai_api_key = os.environ["OPENAI_API_KEY"]
    editorial_api_key = os.environ["EDITORIAL_API_KEY"]
    openai_client = OpenAI(api_key=openai_api_key)

    dry_run = "--dry-run" in sys.argv
    limit = None
    for arg in sys.argv[1:]:
        if arg.startswith("--limit="):
            limit = int(arg.split("=", 1)[1])

    print("Buscando fichas existentes...")
    cards = fetch_all_cards(editorial_api_key)
    themes = fetch_themes(editorial_api_key)
    print(f"{len(cards)} fichas encontradas.")
    if limit:
        cards = cards[:limit]
        print(f"Limitando a {limit} fichas para este run.")

    updated, flagged, errors = [], [], []

    for i, card in enumerate(cards, start=1):
        card_key = card["card_key"]
        print(f"[{i}/{len(cards)}] {card_key} ({card.get('title', '')[:60]!r})...", end=" ")
        try:
            segment_id = card.get("segment_id")
            if not segment_id:
                print("SEM segment_id, pulando.")
                errors.append({"card_key": card_key, "reason": "sem segment_id"})
                continue
            segment = fetch_segment(editorial_api_key, segment_id)
            theme = themes.get(card["theme_key"])
            if not theme:
                print(f"tema {card['theme_key']} não encontrado/inativo, pulando.")
                errors.append({"card_key": card_key, "reason": "tema não encontrado"})
                continue

            result = regenerate(openai_client, theme, segment)

            if not result.get("create_card"):
                print("NOVO JULGAMENTO: create_card=false -- sinalizada para revisão, não tocada.")
                flagged.append({"card_key": card_key, "old_title": card.get("title")})
                continue

            if dry_run:
                print(f"[dry-run] novo title={result['title']!r}")
                updated.append({"card_key": card_key, "old_title": card.get("title"), "new_title": result["title"]})
                continue

            upsert_card(editorial_api_key, card, result, segment)
            print(f"OK -> {result['title']!r}")
            updated.append({"card_key": card_key, "old_title": card.get("title"), "new_title": result["title"]})
        except Exception as exc:
            print(f"ERRO: {exc}")
            errors.append({"card_key": card_key, "reason": str(exc)})
        time.sleep(0.5)

    print("\n=== Relatório ===")
    print(f"Atualizadas: {len(updated)}")
    print(f"Sinalizadas para revisão (create_card=false no novo julgamento): {len(flagged)}")
    for f in flagged:
        print(f"  - {f['card_key']} (era: {f['old_title']!r})")
    print(f"Erros: {len(errors)}")
    for e in errors:
        print(f"  - {e['card_key']}: {e['reason']}")


if __name__ == "__main__":
    main()
