# Fluxos n8n - Estado Real (levantado em 2026-07-14)

Levantado diretamente no workspace `thiagoleao.app.n8n.cloud` via navegador (Claude in Chrome, sessão já logada do autor). Leitura apenas — nenhum workflow, credencial ou data table foi alterado durante o levantamento.

**Plano no momento do levantamento:** trial, 2 dias restantes, 117/1000 execuções usadas. `Prod. executions: 115`, `Failed prod. executions: 5` (falha ~4.3%).

## Achado crítico — leia isto antes de qualquer coisa

**O Fluxo 03 não é manual (como o `PROJECT_CONTEXT.md` dizia) e não está desativado.** Está **Published**, tem gatilho agendado **"Todo domingo"** (além de um gatilho manual), e portanto roda automaticamente toda semana.

**Ele nunca chama a Editorial API.** Todos os seus nós de leitura/escrita ("Carregar fichas para X", "Salvar X", "Atualizar X") são nós do tipo **Data Table** — o recurso nativo de armazenamento do n8n Cloud, não o Cloud SQL. Isso é exatamente o que a ADR-009 §1-2 proíbe como uso permanente ("As Data Tables do n8n poderão ser utilizadas apenas durante períodos de migração, testes ou contingência").

**Os dados nas Data Tables do n8n divergem dos dados reais no Postgres:**

| Data Table (n8n) | Linhas | Tabela correspondente no Postgres | Linhas |
|---|---|---|---|
| `Knowledge Cards` | **90** | `editorial.knowledge_cards` | **76** |
| `Philosophical Concepts` | **34** | `editorial.concepts` (criada pela ADR-011) | **202** (bruto, não curado) |
| `Philosophical Map` | **108** relações | `editorial.concept_relationships` | não existe ainda (é o que a ADR-012 propõe) |
| `Knowledge Themes` | não verificado (0MB, 0 usos em workflows) | `editorial.themes` | 5 |
| `Video Transcription Index` | não verificado | `editorial.sources` (parcialmente) | 13 |
| `Knowledge Processing Index` | não verificado | — | — |

Isto **não é o mesmo schema órfão removido durante a ADR-011** (aquele — `editorial.concepts`/`card_concepts`/`concept_relationships`/`processing_index` no Postgres — estava vazio e desconectado). São dois problemas diferentes: um era scaffolding morto no banco; este é um pipeline **vivo e ativo**, só que gravando no lugar errado (Data Tables do n8n em vez da Editorial API/Cloud SQL).

**Consequência prática:** o cálculo de importância editorial (ADR-009 §7) *está sendo feito* — mas o resultado fica preso dentro do n8n e nunca chega ao Postgres. É por isso que as 76 fichas reais no Cloud SQL têm `importance_score=0`/`importance_level='emergente'` para todas: o Fluxo 03 já roda, calcula, mas escreve num lugar que a Editorial API nunca lê. Vale notar também que os valores calculados hoje são bastante planos (score 25 em praticamente todas as linhas de `Philosophical Concepts` e `Philosophical Map`) — sugere uma fórmula placeholder/inicial, não um cálculo diferenciado de verdade. A ADR-012 precisa endereçar isso de qualquer forma.

**Isto muda o plano da ADR-012:** em vez de partir do zero para o Mapa Filosófico, já existem 34 conceitos curados e 108 relações de coocorrência calculadas dentro do n8n — um bom ponto de partida para migrar/reconciliar, não descartar. Mas a decisão de como reconciliar (qual conjunto é a fonte de verdade, o que migrar) é sua, não foi tomada aqui.

## Workflows (todos "Published")

### 01 - Google Drive Video Transcriber
*Criado 2 julho, atualizado há 1 dia.*

Tem uma nota própria no canvas documentando o fluxo:
> Entrada: pasta Google Drive `1JIzo4ATE3Du0US0lmt3sj7Y6Vi6lfqKx`. Saída: arquivo `.txt` na mesma pasta. Depois que a transcrição for concluída, o vídeo original vai para a lixeira, não é apagado permanentemente. Credenciais necessárias: Google Drive OAuth2; AssemblyAI API em HTTP Header Auth. Importante: para usar `audio_url`, o arquivo precisa estar acessível por link.

Gatilhos: `fileCreated` no Drive, agendamento a cada 30 minutos, e manual. Fluxo: lista vídeos novos → ignora já transcritos → solicita transcrição via `POST` para `ai-services` (que aciona a AssemblyAI) → espera/consulta status → gera um título curto via OpenAI (`gpt-4o-mini` provavelmente, não confirmado neste nó) → salva o `.txt` no Drive (ou salva erro, em caso de falha). Usa a Data Table `Video Transcription Index` para controlar o que já foi processado.

### 02 - Destilação do Conhecimento
*Criado 13 julho, atualizado há 22h — o mais recentemente ajustado.*

Este é o único workflow confirmado gravando corretamente na Editorial API real (Cloud SQL). Fluxo: lista transcrições no Drive → ignora já processadas → baixa e extrai texto → `POST /sources` (cadastra fonte) → `GET /themes` (consulta temas ativos) → dois ramos de LLM (`gpt-4o-mini` via credencial OpenAI):

- **"Identificar segmentos editoriais"** — prompt do sistema (texto integral, capturado no levantamento):
  > Você é um segmentador editorial rigoroso. Identifique apenas blocos contínuos, autônomos e editorialmente valiosos. Preserve o texto literalmente, sem corrigir, resumir, completar ou reescrever. Ignore saudações, intervalos, avisos, conversas administrativas e falas sem desenvolvimento. Tipos permitidos: canalizacao_filosofica, explicacao, perguntas_respostas, exercicio, meditacao. [...] Retorne SOMENTE JSON válido [...] related_themes deve usar somente chaves plausíveis presentes no conteúdo, sem inventar.
  
  Nota: o prompt permite só 5 dos 6 tipos da ADR-010 — `orientacao_administrativa` é tratado como conteúdo a ignorar/descartar na origem, nunca gravado como segmento. Bate exatamente com o que os dados reais mostram (nenhum segmento com esse tipo existe). `speaker_type` no exemplo do prompt só usa `"consciencia_canalizada"` — confirma que não há captura de identidade de consciência específica (ver ADR-011 §3).

- **"Avaliar tema e gerar ficha"** — prompt do sistema:
  > Você é um arquivista editorial rigoroso. Analise somente o segmento fornecido. Nunca use conhecimento externo, nunca complete lacunas e nunca invente ensinamentos. Uma simples menção ao tema não é suficiente. Só marque create_card:true quando houver conteúdo explícito, desenvolvido e editorialmente útil sobre o tema. [...] quotes e evidence devem ser trechos literais do segmento.

  Confirma que os princípios de "nunca inventar" da ADR-009/010 já estão codificados no prompt real, não só na documentação.

Depois: valida e salva via `POST /segments` e `POST /knowledge-cards` na Editorial API (URLs confirmadas: `https://editorial-api-tugu5b252q-rj.a.run.app/segments` e `/knowledge-cards`, autenticação via credencial "Editorial API" Header Auth). **Este workflow está correto e não precisa de ação.**

### 03 - Importância Editorial e Mapa Filosófico
*Criado 13 julho, atualizado há 1 dia. Ver "Achado crítico" acima.*

Três ramos paralelos, todos operando em Data Tables do n8n (não na Editorial API):
1. `Carregar fichas para importancia` (Data Table `Knowledge Cards`, Get) → `Calcular importancia editorial` (function node) → `Atualizar importancia nas fichas` (Data Table `Knowledge Cards`, Upsert)
2. `Carregar fichas para conceitos` → `Consolidar conceitos` (function node) → `Salvar conceitos filosoficos` (Data Table `Philosophical Concepts`, Upsert)
3. `Carregar fichas para mapa` → `Construir mapa de coocorrencias` (function node) → `Salvar mapa filosofico` (Data Table `Philosophical Map`, Upsert)

Gatilhos: manual e `Todo domingo` (agendado, semanal).

## Credenciais cadastradas

| Nome | Tipo | Usos em workflows | Observação |
|---|---|---|---|
| Editorial API | Header Auth | 1 | usada pelo Fluxo 02 |
| AI Services API | Header Auth | 1 | usada pelo Fluxo 01 |
| Google Drive account | OAuth2 | 2 | Fluxos 01 e 02 |
| OpenAI account | OpenAI | 2 | Fluxos 01 (título) e 02 (segmentação/fichas) — modelo usado: `gpt-4o-mini` |
| Header Auth account | Header Auth | 1 | não identificado qual node usa — investigar se necessário |
| S3 account | AWS S3 | 0 (nenhum uso listado) | não referenciada por nenhum node atualmente visível — possível resquício de uma abordagem anterior de armazenamento; sem risco imediato, mas vale perguntar ao autor se ainda serve para algo |

## Ações realizadas (2026-07-14, após decisão do autor)

- **Fluxo 03 despublicado (Unpublish)** no n8n Cloud — confirmado via diálogo "This will prevent all production executions to this workflow until you publish again." Não roda mais automaticamente no domingo até ser republicado.
- **Reconciliação das fichas — achado mais preciso que o estimado inicialmente:** comparando as 91 linhas de `Knowledge Cards` (n8n) contra as 76 de `editorial.knowledge_cards` (Postgres) por `(source_file_id, theme_key, title)`, apenas **11 fichas** estavam realmente ausentes — não ~14. Todas as 11 vêm de **exatamente 2 sessões que nunca passaram pelo pipeline real**: nenhuma das duas tinha `source` no Postgres, logo também não tinha segmentos. Inserir essas 11 fichas direto via API as deixaria sem `segment_id` — órfãs, violando o princípio de rastreabilidade da ADR-010.
- **Decisão tomada:** não copiar as 11 fichas soltas. Em vez disso, as 2 fontes foram cadastradas via `POST /sources` (`processing_status: "pending"`) para que o **Fluxo 02** — que já funciona corretamente — as processe do zero na próxima execução (segmentação + fichas com rastreabilidade completa):
  - `1JIkgLfQwuJS4JAabs6MdYsh87n5Xqsn9` — sessão de 06/01/2026 ("manifestação e autoconhecimento")
  - `1xiWXBdza2Xi05RhmXekutYk9KrJNsWfK` — aula de 29/12/2025 ("desenvolvimento mediúnico e meditação")
  
- **Conceitos/relações do n8n (34 conceitos, 108 relações) — decisão: não migrar.** Os 108 registros de `Philosophical Map` têm `cooccurrence_count=1` e `strength_score=25` em 100% das linhas — um cálculo placeholder, não diferenciado. Uma vez que a ADR-012 calcule `concept_relations` direto sobre `segment_concepts`/`card_concepts` (já normalizados pela ADR-011), o resultado será mais completo e correto do que importar esses 108 registros. Os 34 nomes de conceito ficam só como referência informal de curadoria para revisão futura, sem ação associada.

## Investigação e correção: por que as 2 sessões não foram processadas (2026-07-15)

Pediu-se para investigar por que o Fluxo 02, mesmo já tendo rodado várias vezes desde 2026-07-14, nunca processou as 2 sessões cadastradas acima. Dois problemas reais, distintos, foram encontrados e corrigidos:

1. **Status travado na Data Table "Knowledge Processing Index".** O nó "Ignorar transcrições processadas" do Fluxo 02 não consulta o Postgres — consulta essa Data Table do n8n (`source_file_id` + `status = "completed"`, "If Row Does Not Exist"). As 2 sessões já estavam marcadas `completed` ali desde 13/07 pela tentativa antiga (mesma origem do achado anterior), então o fluxo real as pulava, achando que já tinham sido processadas. Corrigido: `status` alterado para `needs_reprocessing` nas 2 linhas correspondentes (id 1 e 2 da tabela).

2. **Bug real no `editorial-api`, presente desde a ADR-011, achado ao tentar reprocessar.** Ao regravar um segmento/ficha que já existe (`existing` buscado via `SELECT *`), os campos JSONB vêm do psycopg2 já desserializados em listas Python — e o código os reinseria em `segment_revisions`/`card_revisions` sem reembrulhar em `Json(...)`, causando `psycopg2.errors.DatatypeMismatch: column "keywords" is of type jsonb but expression is of type text[]`. **Esse bug estava derrubando as execuções agendadas do Fluxo 02 desde a meia-noite de 2026-07-15** (não só as 2 sessões da reconciliação) — visível no histórico de execuções alternando sucesso/erro. Corrigido em `main.py` (`upsert_segment` e `upsert_knowledge_card`) e implantado (revisão `editorial-api-00009-6dq`). Validado com um reenvio seguro de um segmento já existente antes de mexer em dados novos.

Depois da correção, uma execução completa do Fluxo 02 rodou do início ao fim sem erro. O fluxo processa 1 arquivo por execução entre ~106 pendentes (~10 min cada, mais lento agora que grava embeddings a cada gravação) — as 2 sessões específicas não caíram nessa execução por acaso, mas devem ser pegas naturalmente pelo agendamento de 2 em 2 horas ao longo do tempo. Decisão do autor: deixar o agendamento natural cuidar disso, sem disparo manual repetido.

## Decisões que ainda restam

1. Quando/se republicar o Fluxo 03 — só depois de reescrevê-lo para gravar via Editorial API em vez de Data Tables (isso é, na prática, o que a ADR-012 precisa entregar).
2. Acompanhar se as 2 sessões da reconciliação são de fato processadas nos próximos ciclos agendados.
