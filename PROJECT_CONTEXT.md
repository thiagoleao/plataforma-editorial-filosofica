# Plataforma Editorial Filosófica

> Este documento é a memória oficial do projeto. Qualquer IA (Claude, Gemini, Codex, ChatGPT) deve conseguir assumir o projeto lendo apenas este arquivo, sem precisar reconstruir contexto. Toda nova ADR deve atualizar este documento.

> **Antes de confiar neste arquivo de olhos fechados:** já aconteceu de infraestrutura real divergir do que estava documentado aqui (ver nota de implementação da ADR-011). Para o estado verificado da GCP, ver [docs/GCP_INFRAESTRUTURA.md](./docs/GCP_INFRAESTRUTURA.md). Para o estado real dos fluxos n8n — **incluindo um achado crítico: o Fluxo 03 roda automaticamente todo domingo e grava só em Data Tables do n8n, nunca no Postgres real, com dados divergentes dos que estão no Cloud SQL** — ver [docs/N8N_FLUXOS.md](./docs/N8N_FLUXOS.md).

## Objetivo

Construir uma plataforma capaz de transformar um acervo de vídeos em patrimônio intelectual estruturado, permitindo a produção de livros, cursos e pesquisas filosóficas sem perda da autoria original.

A IA atua apenas como organizadora do conhecimento. Nunca como autora.

## Stack Tecnológica

### Orquestração — n8n (Cloud)

Responsabilidade:
- Orquestrar todos os fluxos
- Agendar execuções
- Chamar APIs
- Integrar Google Drive, OpenAI e Editorial API

### Armazenamento de vídeos — Google Drive

Estrutura:
```text
incoming/
transcritos/
```

Os vídeos permanecem no Drive. As transcrições são gravadas como TXT.

### Serviço de Transcrição — Cloud Run

Projeto GCP: `thiago-ai-platform`

Responsabilidade:
- Ler vídeos diretamente do Google Drive
- Enviar para AssemblyAI
- Retornar transcrição

Não há download manual dos vídeos.

**Status (confirmado em 2026-07-14 via GCP):** o serviço está de fato implantado e saudável no Cloud Run (`ai-services`, `GET /health` OK), usando as secrets `assemblyai-api-key`/`ai-services-api-key`. O que não existe é o código-fonte versionado — não há cópia local equivalente à que existia para o `editorial-api` antes de 2026-07-14. Só resta a imagem já construída no Artifact Registry. Ver [docs/GCP_INFRAESTRUTURA.md](./docs/GCP_INFRAESTRUTURA.md).

### Speech-to-Text — AssemblyAI

Idioma: `pt`

### Banco Oficial — Cloud SQL

- Engine: PostgreSQL
- Banco: `plataforma_editorial_filosofica`
- Instância: `plataforma-editorial-filosofica` (projeto `thiago-ai-platform`)

É a única fonte oficial de dados.

### API da Plataforma — Cloud Run

- Nome do serviço: `editorial-api`
- URL: `https://editorial-api-tugu5b252q-rj.a.run.app`
- Autenticação: header `X-Service-Api-Key`, chave em Secret Manager (`editorial-api-key`, projeto `thiago-ai-platform`)
- Código-fonte: [`editorial-api/`](./editorial-api/)

Responsabilidade: toda gravação e leitura passa por essa API. O n8n nunca grava diretamente no banco.

Endpoints implementados (`editorial-api/main.py`):
- `GET /health`
- `GET /themes`
- `POST /sources`
- `POST /segments`
- `GET /segments`
- `GET /segments/<id>`
- `POST /knowledge-cards`
- `GET /knowledge-cards`

## Fluxos existentes

### Fluxo 01 — Ingestão
- localizar vídeos novos
- solicitar transcrição
- salvar TXT
- atualizar índice

### Fluxo 02 — Destilação
- ler transcrições
- identificar segmentos
- salvar segmentos
- gerar fichas
- salvar fichas

### Fluxo 03 — Mapa Filosófico
**Correção (2026-07-14):** não era manual — estava publicado com gatilho agendado semanal ("Todo domingo"). Grava em Data Tables nativas do n8n, não na Editorial API/Cloud SQL — violação da ADR-009. **Despublicado (Unpublish) em 2026-07-14** — não roda mais até ser republicado, o que só deve acontecer após ser reescrito para gravar via Editorial API (escopo da ADR-012). Ver [docs/N8N_FLUXOS.md](./docs/N8N_FLUXOS.md).

## ADRs implementadas

- [ADR-009](./docs/adr/ADR-009.md) — Arquitetura oficial. Princípios: Cloud SQL é a fonte oficial; Editorial API centraliza regras; n8n apenas orquestra.
- [ADR-010](./docs/adr/ADR-010.md) — Preservação de Segmentos. Toda transcrição passa por segmentação. Segmentos representam ativos editoriais. Canalizações são preservadas literalmente. Fichas sempre apontam para segmentos.
- [ADR-011](./docs/adr/ADR-011.md) — Fundação de Dados da Camada Editorial. Normaliza conceitos (`editorial.concepts`/`segment_concepts`/`card_concepts`), vocabulário controlado para `segment_type` (`editorial.segment_types`) e para quem fala (`editorial.speakers`), trilha de auditoria de reprocessamento (`segment_revisions`/`card_revisions`). Aplicada em produção em 2026-07-14 — ver nota de implementação na própria ADR, incluindo remoção de um schema órfão não documentado (`concepts`/`card_concepts`/`concept_relationships`/`processing_index` de uma tentativa anterior via ChatGPT, vazio e desconectado da API).
- [ADR-012](./docs/adr/ADR-012.md) — Mapa Filosófico Automatizado e Recuperação Semântica. **Implementada em 2026-07-14/15**, incluindo busca semântica: `editorial.concept_relations` (595 relações calculadas), `importance_score`/`importance_level` reais em conceitos e fichas (4 "pilar", 16 "forte", 42 "apoio", 147 "emergente" — antes tudo 0/"emergente"), e `POST /search` com embeddings OpenAI (`text-embedding-3-small`) — testado retornando conteúdo relevante mesmo sem correspondência exata de palavra-chave. Ver nota de implementação na ADR.

## Roadmap de ADRs propostas (2026-07-14)

Plano para viabilizar a geração de capítulos de livro com qualidade, a partir de um parecer técnico sobre o estado do projeto. Status "Proposta" — ainda não implementadas.

- [ADR-013](./docs/adr/ADR-013.md) — Projetos de Livro e Montagem de Capítulos. Introduz `book_projects`/`chapters`/`chapter_sources`. Define a regra central: canalizações sempre entram como blocos literais intocáveis; fichas alimentam apenas texto de transição. Montagem é sempre proposta, com aprovação humana antes de avançar.
- [ADR-014](./docs/adr/ADR-014.md) — Revisão Editorial e Consolidação. Detecção de duplicidade entre capítulos, checklist de consistência terminológica, aprovação humana obrigatória.
- [ADR-015](./docs/adr/ADR-015.md) — Publicação Final. Exportação DOCX (primário) → PDF/EPUB derivados, metadados e manifesto de rastreabilidade.

Decisões explicitamente pendentes (não devem ser assumidas silenciosamente em implementação futura):
- Levantamento das consciências canalizadas distintas do acervo (ADR-011 §3) — hoje só existe o marcador genérico "consciência canalizada".
- **Resolvido em 2026-07-15:** as 2 fontes de reconciliação (`1JIkgLfQwuJS4JAabs6MdYsh87n5Xqsn9`, `1xiWXBdza2Xi05RhmXekutYk9KrJNsWfK`) estavam bloqueadas por dois problemas reais, ambos corrigidos — ver nota de implementação na ADR-011 e [docs/N8N_FLUXOS.md](./docs/N8N_FLUXOS.md) para detalhes. Continuam com `processing_status: pending` porque o Fluxo 02 processa 1 arquivo por execução entre ~106 pendentes; devem ser pegas naturalmente pelo agendamento de 2 em 2 horas, sem ação adicional necessária.
- Reescrever o Fluxo 03 para gravar via Editorial API antes de republicá-lo (hoje despublicado).

## Modelo de dados

```
Vídeo
  ↓
Transcrição
  ↓
Segmento
  ↓
Ficha
  ↓
Mapa Filosófico
  ↓
Projeto de Livro
  ↓
Capítulo
  ↓
Livro
```

## Princípios obrigatórios

- Nunca inventar conteúdo.
- Nunca completar lacunas.
- Nunca reescrever canalizações durante a preservação.
- Todo conhecimento deve possuir rastreabilidade.
- A IA organiza. O autor continua sendo a fonte original.

## Estado atual

- Infraestrutura concluída.
- Pipeline de transcrição concluído.
- Pipeline de preservação concluído.
- Pipeline de fichas concluído.
- Cloud SQL operacional.
- Editorial API operacional.
- Código do `editorial-api` versionado neste repositório em 2026-07-14 (antes vivia apenas em `~/Projects/editorial-api`, sem git).

## Próxima evolução

Ver seção "Roadmap de ADRs propostas" acima. Próximo passo de implementação: ADR-013 (Projetos de Livro e Montagem de Capítulos), agora que ADR-011 e ADR-012 (incluindo busca semântica) estão totalmente aplicadas.

## Estrutura do repositório

```
plataforma-editorial-filosofica/
├── PROJECT_CONTEXT.md          # este arquivo — memória oficial do projeto
├── docs/
│   ├── GCP_INFRAESTRUTURA.md    # estado real da GCP, levantado via gcloud/psql (não por inferência)
│   ├── N8N_FLUXOS.md            # estado real dos 3 fluxos (levantado direto no n8n Cloud) + achado crítico do Fluxo 03
│   └── adr/
│       ├── ADR-009.md          # arquitetura oficial (n8n orquestra, Cloud SQL é fonte, Editorial API centraliza)
│       ├── ADR-010.md          # preservação de segmentos e canalizações
│       ├── ADR-011.md          # IMPLEMENTADA — normalização de conceitos, vocabulários controlados, auditoria
│       ├── ADR-012.md          # IMPLEMENTADA — Mapa Filosófico automatizado + busca semântica (embeddings OpenAI)
│       ├── ADR-013.md          # PROPOSTA — Projetos de Livro e montagem de capítulos
│       ├── ADR-014.md          # PROPOSTA — revisão editorial e consolidação
│       └── ADR-015.md          # PROPOSTA — publicação final (DOCX/PDF/EPUB)
├── editorial-api/              # API oficial (Flask + Cloud SQL), deploy no Cloud Run
│   ├── main.py
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── migration_000_baseline.sql  # dump schema-only real do banco, capturado em 2026-07-14
│   ├── migration_adr_010.sql
│   ├── migration_adr_011.sql
│   ├── migration_adr_012.sql
│   ├── migration_adr_012_embeddings.sql
│   └── DEPLOY_ADR-011.md
├── ai-services/                 # Serviço RODANDO em produção (Cloud Run), mas código-fonte não versionado em lugar nenhum — ver docs/GCP_INFRAESTRUTURA.md.
└── n8n-workflows/                # PLACEHOLDER — exports JSON dos fluxos 01/02/03. Ainda não exportados do n8n Cloud.
```

**Nota:** existe um quarto serviço no mesmo projeto GCP, `arquitetura-planner` (Cloud Run, protegido por IAM), que **não faz parte** desta plataforma — é uma ferramenta pessoal separada de planejamento de arquitetura via LLM. Documentado em [docs/GCP_INFRAESTRUTURA.md](./docs/GCP_INFRAESTRUTURA.md) só para não ser confundido com o pipeline editorial numa auditoria futura.

## Lacunas conhecidas

- Código-fonte do serviço de transcrição (`ai-services`) não está versionado em lugar nenhum — o serviço está rodando em produção (confirmado 2026-07-14), mas só existe como imagem já construída no Artifact Registry, sem cópia local recuperável.
- Workflows do n8n (Fluxos 01, 02, 03) existem apenas no n8n Cloud, sem export JSON versionado em `n8n-workflows/` (levantados via navegador em 2026-07-14, mas o export formal ainda não foi feito).
- **Fluxo 03 grava em Data Tables do n8n em vez da Editorial API** (violação da ADR-009) — despublicado em 2026-07-14 até ser reescrito para gravar via API (escopo da ADR-012). Das 11 fichas que só existiam no n8n, nenhuma foi copiada; as 2 sessões de origem foram cadastradas via `POST /sources` e aguardam processamento pelo Fluxo 02. Ver [docs/N8N_FLUXOS.md](./docs/N8N_FLUXOS.md).
- ~~Não há migrações SQL anteriores à ADR-010 versionadas~~ — resolvido em 2026-07-14: baseline completo do schema `editorial.*` capturado via `pg_dump --schema-only` em [`editorial-api/migration_000_baseline.sql`](./editorial-api/migration_000_baseline.sql).
