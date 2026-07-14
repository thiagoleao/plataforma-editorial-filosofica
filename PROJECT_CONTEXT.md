# Plataforma Editorial Filosófica

> Este documento é a memória oficial do projeto. Qualquer IA (Claude, Gemini, Codex, ChatGPT) deve conseguir assumir o projeto lendo apenas este arquivo, sem precisar reconstruir contexto. Toda nova ADR deve atualizar este documento.

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

**Status do código-fonte:** não localizado ainda neste monorepo (ver seção "Lacunas conhecidas"). Placeholder em `ai-services/`.

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
Responsável por consolidar a biblioteca. Atualmente executado manualmente durante o povoamento.

## ADRs implementadas

- [ADR-009](./docs/adr/ADR-009.md) — Arquitetura oficial. Princípios: Cloud SQL é a fonte oficial; Editorial API centraliza regras; n8n apenas orquestra.
- [ADR-010](./docs/adr/ADR-010.md) — Preservação de Segmentos. Toda transcrição passa por segmentação. Segmentos representam ativos editoriais. Canalizações são preservadas literalmente. Fichas sempre apontam para segmentos.

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

### ADR-011 (planejada) — Camada Editorial
Responsável por identificar ativos editoriais reutilizáveis para construção de livros.

## Estrutura do repositório

```
plataforma-editorial-filosofica/
├── PROJECT_CONTEXT.md          # este arquivo — memória oficial do projeto
├── docs/
│   └── adr/
│       ├── ADR-009.md          # arquitetura oficial (n8n orquestra, Cloud SQL é fonte, Editorial API centraliza)
│       └── ADR-010.md          # preservação de segmentos e canalizações
├── editorial-api/              # API oficial (Flask + Cloud SQL), deploy no Cloud Run
│   ├── main.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── migration_adr_010.sql
├── ai-services/                 # PLACEHOLDER — serviço de transcrição (Cloud Run + AssemblyAI). Código-fonte ainda não localizado/versionado.
└── n8n-workflows/                # PLACEHOLDER — exports JSON dos fluxos 01/02/03. Ainda não exportados do n8n Cloud.
```

## Lacunas conhecidas

- Código-fonte do serviço de transcrição (Cloud Run) ainda não foi localizado nem versionado — pasta `ai-services/` é um placeholder.
- Workflows do n8n (Fluxos 01, 02, 03) existem apenas no n8n Cloud, sem export versionado em `n8n-workflows/`.
- Não há migrações SQL anteriores à ADR-010 versionadas (apenas `migration_adr_010.sql`).
