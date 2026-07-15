# Infraestrutura GCP - Estado Real (levantado em 2026-07-14)

Este documento registra o que existe de fato no projeto GCP `thiago-ai-platform`, levantado via `gcloud`/`psql` diretamente contra a infraestrutura — não a partir do que os documentos do repositório *diziam* que existia. Motivo: durante a implementação da ADR-011 foi encontrado schema em produção não documentado em lugar nenhum (ver [ADR-011](./adr/ADR-011.md), seção "Nota de implementação"). Este documento existe para que isso não se repita.

**Conta usada no levantamento:** `contato@banhoseterapias.com` (roles/owner no projeto).

## Cloud Run (região `southamerica-east1`)

Quatro serviços rodando — dois fazem parte desta plataforma.

### `editorial-api` — documentado (ADR-009/010/011)
- URL: `https://editorial-api-tugu5b252q-rj.a.run.app`
- Código-fonte: [`editorial-api/`](../editorial-api/) neste repositório.
- Service account: `editorial-api@thiago-ai-platform.iam.gserviceaccount.com` — única com `roles/cloudsql.client` a nível de projeto.
- Acesso: público, protegido por chave de aplicação (`X-Service-Api-Key`, secret `editorial-api-key`).
- Conecta no Cloud SQL via socket `/cloudsql/...` (Unix socket, sem proxy).

### `editorial-ui` — documentado (ADR-016, implantado em 2026-07-15)
- URL: `https://editorial-ui-592824114603.southamerica-east1.run.app`
- Código-fonte: [`editorial-ui/`](../editorial-ui/) neste repositório.
- Service account: `editorial-ui@thiago-ai-platform.iam.gserviceaccount.com` — sem `roles/cloudsql.client` (não acessa o banco; fala só com a `editorial-api`); tem `secretmanager.secretAccessor` no secret reaproveitado `editorial-api-key`.
- Acesso: `--no-allow-unauthenticated` — `roles/run.invoker` restrito a `contato@banhoseterapias.com`, mesmo padrão do `arquitetura-planner`. Acesso via `gcloud run services proxy editorial-ui --region southamerica-east1 --project thiago-ai-platform`.
- Chama a `editorial-api` via HTTPS público, com a mesma chave `X-Service-Api-Key` lida do secret acima.

### `ai-services` — existe e está rodando; **código-fonte não está versionado em lugar nenhum**
- URL: `https://ai-services-tugu5b252q-rj.a.run.app`
- `GET /health` responde `{"status":"ok"}` — serviço ativo e saudável.
- Variáveis de ambiente: `ASSEMBLYAI_API_KEY` (secret `assemblyai-api-key`), `SERVICE_API_KEY` (secret `ai-services-api-key`) — confirma que é o serviço de transcrição descrito no `PROJECT_CONTEXT.md`.
- Service account: `ai-services@thiago-ai-platform.iam.gserviceaccount.com` (sem `cloudsql.client` — não acessa o banco diretamente, consistente com a arquitetura da ADR-009).
- Última imagem construída: 2026-07-10, via `gcloud run deploy --source` (repositório Artifact Registry `cloud-run-source-deploy`, o mesmo padrão do `editorial-api`).
- **Não há diretório local equivalente a `~/Projects/ai-services`** (verificado em `~/Projects/`) — diferente do que aconteceu com o `editorial-api`, que foi resgatado de `~/Projects/editorial-api` e versionado neste repo em 2026-07-14. O código-fonte deste serviço parece ter sido perdido localmente; só resta a imagem já construída no Artifact Registry. Extração de código a partir da imagem (`docker pull` + inspeção de camadas) é tecnicamente possível se algum dia for necessário recuperar/auditar a lógica, mas não foi feita aqui.
- **Ação sugerida:** se houver alguma cópia do código-fonte em outro lugar (outro laptop, Cloud Shell, histórico do Cloud Build), versionar aqui antes que se perca de vez. Isso já era uma lacuna conhecida do `PROJECT_CONTEXT.md`; agora está confirmado que o serviço está no ar mesmo sem o código.

### `arquitetura-planner` — não faz parte da Plataforma Editorial Filosófica
- URL: `https://arquitetura-planner-tugu5b252q-rj.a.run.app` (protegida por IAM — só `contato@banhoseterapias.com` tem `roles/run.invoker`; não é acessível publicamente nem pela chave de serviço deste projeto).
- É um app Next.js: "Planejador de Soluções de Arquitetura" — formulário (contexto, objetivo, entregáveis, restrições, arquivos de apoio) que gera roadmap/marcos/atividades via LLM. Usa `ANTHROPIC_API_KEY` (secret `anthropic-api-key`), modelo configurado `claude-sonnet-5`. A própria interface informa "Nada é salvo — copie o resultado ao final": ferramenta stateless, sem persistência.
- Redeployado 4 vezes só no dia 2026-07-14 (18:31–18:48) — desenvolvimento ativo recente, no mesmo dia desta sessão.
- Sem relação com o pipeline vídeo→livro. Registrado aqui só para não ser confundido com parte da plataforma editorial numa auditoria futura.

## Cloud SQL

- Instância: `plataforma-editorial-filosofica` (projeto `thiago-ai-platform`, região `southamerica-east1-c`).
- Engine: PostgreSQL 15, tier `db-f1-micro`, disco 10GB, `ZONAL` (sem alta disponibilidade).
- Backup: automático, diário às 03:00, retenção de 7 backups + 7 dias de WAL.
- Rede: IP público habilitado, SSL não obrigatório (`requireSsl: false`, `sslMode: ALLOW_UNENCRYPTED_AND_ENCRYPTED`) — aceita conexão sem TLS. Acesso de fato só ocorre via socket Unix do Cloud Run ou via Cloud SQL Auth Proxy (IAM), então o risco prático é baixo, mas vale endurecer (`requireSsl: true`) numa próxima passada de segurança.
- Bancos: `postgres` (padrão) e `plataforma_editorial_filosofica` (o oficial).
- Usuários: `postgres` (admin, secret `editorial-postgres-admin-password`) e `editorial_app` (aplicação, secret `editorial-database-password`).
- **Schema real (`editorial.*`) capturado via `pg_dump --schema-only`** em [`editorial-api/migration_000_baseline.sql`](../editorial-api/migration_000_baseline.sql) — este era um item pendente da ADR-011 (decisão §1), agora resolvido. Gerado em 2026-07-14, imediatamente após a aplicação da migration da ADR-011 e a remoção do schema órfão (ver ADR-011).

### Contagem de linhas por tabela (2026-07-14, pós ADR-011)

| Tabela | Linhas |
|---|---|
| `sources` | 13 |
| `themes` | 5 |
| `content_segments` | 43 |
| `knowledge_cards` | 76 |
| `segment_types` | 6 |
| `speakers` | 2 |
| `concepts` | 202 |
| `segment_concepts` | 71 |
| `card_concepts` | 345 |
| `segment_revisions` | 0 |
| `card_revisions` | 0 |

## Secret Manager

| Secret | Uso |
|---|---|
| `editorial-api-key` | Chave de serviço do `editorial-api` (`X-Service-Api-Key`) |
| `editorial-database-password` | Senha do usuário `editorial_app` no Cloud SQL |
| `editorial-postgres-admin-password` | Senha do usuário `postgres` (admin) no Cloud SQL |
| `openai-api-key` | Chave da OpenAI, usada pela `editorial-api` para gerar embeddings (ADR-012 §4-5, adicionada em 2026-07-15). Acesso restrito à service account `editorial-api`. |
| `ai-services-api-key` | Chave de serviço do `ai-services` |
| `assemblyai-api-key` | Chave da AssemblyAI, usada pelo `ai-services` |
| `anthropic-api-key` | Chave da Anthropic, usada pelo `arquitetura-planner` |
| `planner-api-key`, `planner-database-password` | Encontrados numa nova checagem, não auditados a fundo — indicam que o `arquitetura-planner` ganhou banco próprio desde o levantamento original de 2026-07-14. Fora do escopo desta plataforma; revisar se for mexer nesse serviço. |

## Artifact Registry

- Um único repositório Docker: `cloud-run-source-deploy` (`southamerica-east1`) — criado automaticamente pelo padrão `gcloud run deploy --source .`. Contém as imagens dos 4 serviços acima.

## Service Accounts

| Service account | Usado por | Papel notável |
|---|---|---|
| `editorial-api@...` | Cloud Run `editorial-api` | `roles/cloudsql.client` (única com acesso ao Cloud SQL) |
| `editorial-ui@...` | Cloud Run `editorial-ui` | `secretmanager.secretAccessor` em `editorial-api-key`; sem acesso ao Cloud SQL |
| `ai-services@...` | Cloud Run `ai-services` | sem acesso ao Cloud SQL |
| `arquitetura-planner@...` | Cloud Run `arquitetura-planner` | sem acesso ao Cloud SQL |
| `...-compute@developer.gserviceaccount.com` | conta padrão do Compute Engine | `roles/run.builder` (usada em builds `gcloud run deploy --source`) |

## O que **não** existe (verificado, não assumido)

- Cloud Scheduler: API desabilitada no projeto — nenhum job agendado fora do n8n Cloud.
- Cloud Functions: API desabilitada — nenhuma função serverless.
- Nenhum bucket de armazenamento próprio da aplicação — só o bucket automático `run-sources-thiago-ai-platform-southamerica-east1` usado internamente pelo `gcloud run deploy --source` para upload de fontes.

## Como este documento foi gerado

Todas as informações vieram de comandos de leitura (`gcloud run/sql/iam/artifacts/secrets/scheduler/functions describe|list`, `pg_dump --schema-only`, `curl` em endpoints de health) — nenhuma alteração foi feita na infraestrutura para produzir este levantamento. Deve ser atualizado sempre que uma mudança de infraestrutura for feita fora deste fluxo de trabalho (ex.: deploy manual, alteração direto no console).
