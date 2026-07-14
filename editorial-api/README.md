# ADR-010 - Implantação

1. Conecte ao banco:

```bash
gcloud sql connect plataforma-editorial-filosofica \
  --user=postgres \
  --database=plataforma_editorial_filosofica
```

2. Dentro do `psql`, aplique:

```sql
\i /CAMINHO_COMPLETO/migration_adr_010.sql
```

3. Valide:

```sql
\dt editorial.content_segments
\d editorial.content_segments
\d editorial.knowledge_cards
```

4. Substitua o `main.py` da pasta `~/Downloads/editorial-api` pelo arquivo deste pacote e faça novo deploy com o mesmo comando usado anteriormente.

5. Teste:

```bash
EDITORIAL_API_URL="https://editorial-api-tugu5b252q-rj.a.run.app"
EDITORIAL_API_KEY=$(gcloud secrets versions access latest --secret=editorial-api-key --project=thiago-ai-platform)

curl "$EDITORIAL_API_URL/health"
curl "$EDITORIAL_API_URL/segments?limit=5" -H "X-Service-Api-Key: $EDITORIAL_API_KEY"

unset EDITORIAL_API_KEY
```

Antes do primeiro processamento, `/segments` deve retornar `[]`.
