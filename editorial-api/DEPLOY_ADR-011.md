# ADR-011 - Implantação

## 1. Migration

Requer o usuário `postgres` (a migration cria a extensão `unaccent` e uma função, o que exige privilégio de superusuário/owner do banco):

```bash
gcloud sql connect plataforma-editorial-filosofica \
  --user=postgres \
  --database=plataforma_editorial_filosofica
```

Dentro do `psql`:

```sql
\i /CAMINHO_COMPLETO/migration_adr_011.sql
```

A migration é idempotente (pode rodar mais de uma vez sem efeito colateral).

## 2. Validação pós-migration

```sql
\dt editorial.segment_types
\dt editorial.speakers
\dt editorial.concepts
\dt editorial.segment_concepts
\dt editorial.card_concepts
\dt editorial.segment_revisions
\dt editorial.card_revisions

SELECT * FROM editorial.segment_types ORDER BY name;
SELECT * FROM editorial.speakers;
SELECT count(*) FROM editorial.concepts;
SELECT count(*) FROM editorial.segment_concepts;
SELECT count(*) FROM editorial.card_concepts;

-- confere que todo segmento e toda ficha ficaram com pelo menos um vínculo de conceito
-- (quando o campo concepts original não era vazio)
SELECT cs.id, cs.title
FROM editorial.content_segments cs
WHERE jsonb_array_length(cs.concepts) > 0
  AND NOT EXISTS (SELECT 1 FROM editorial.segment_concepts sc WHERE sc.segment_id = cs.id);
```

A última consulta deve retornar 0 linhas. Se retornar alguma, investigar antes de prosseguir (provável concept com caractere fora do padrão esperado).

## 3. Deploy da nova API

Substituir `main.py` no pacote de deploy e repetir o mesmo comando de deploy usado anteriormente (Cloud Run, mesmo serviço `editorial-api`). Nenhuma variável de ambiente nova é necessária.

## 4. Teste

```bash
EDITORIAL_API_URL="https://editorial-api-tugu5b252q-rj.a.run.app"
EDITORIAL_API_KEY=$(gcloud secrets versions access latest --secret=editorial-api-key --project=thiago-ai-platform)

curl "$EDITORIAL_API_URL/segment-types" -H "X-Service-Api-Key: $EDITORIAL_API_KEY"
curl "$EDITORIAL_API_URL/speakers" -H "X-Service-Api-Key: $EDITORIAL_API_KEY"
curl "$EDITORIAL_API_URL/concepts?limit=10" -H "X-Service-Api-Key: $EDITORIAL_API_KEY"
curl "$EDITORIAL_API_URL/segments?concept=autoconhecimento&limit=5" -H "X-Service-Api-Key: $EDITORIAL_API_KEY"

unset EDITORIAL_API_KEY
```

## 5. Compatibilidade

- Os campos `concepts`/`keywords`/`related_themes` em JSONB continuam sendo gravados como antes — nada quebra no contrato existente com o Fluxo 02 do n8n.
- `segment_type` passa a ser validado contra `editorial.segment_types`: um valor fora da lista agora recebe `400` em vez de ser aceito silenciosamente. Os 6 valores aceitos: `canalizacao_filosofica`, `explicacao`, `perguntas_respostas`, `exercicio`, `meditacao`, `orientacao_administrativa`.
- Nenhuma mudança é necessária no Fluxo 02 para este deploy — os valores de `segment_type` já enviados hoje batem exatamente com essa lista (verificado em produção em 2026-07-14).
