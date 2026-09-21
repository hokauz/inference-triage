# Inference Triage — notas do projeto

> Documento técnico consolidado a partir das discussões sobre a POC do desafio FinGuard.
>
> Status: proposta de escopo e arquitetura para a primeira implementação.
>
> Nome de trabalho: **Inference Triage**. Alternativas consideradas: `Priority Pipeline`, `Prioritize`, `Decision Pipeline` e `TriageFlow`.

## 1. Resumo executivo

O projeto investiga uma hipótese simples:

> Nem todo item precisa consumir o custo, a latência e os tokens de um LLM generativo. Um modelo decisório local pode classificar e priorizar a maior parte dos casos; um LLM generativo deve ser reservado para resumo, revisão, ambiguidade e casos de maior risco.

O sistema proposto recebe reclamações do FinGuard, produz decisões estruturadas de baixo custo, atribui urgência e encaminha o trabalho para uma fila de prioridade. Workers assíncronos processam primeiro os itens que merecem atenção, usando um modelo generativo apenas quando a política do pipeline indicar. O resultado é persistido e avaliado em dois níveis:

1. qualidade da decisão: categoria, produto, urgência, risco e confiança;
2. qualidade operacional: tempo de espera, latência total, throughput, custo, tokens e tempo até o resumo crítico.

O objetivo inicial não é construir uma plataforma distribuída nem uma arquitetura multiagente. É validar o comportamento essencial com uma aplicação local, um núcleo monolítico, SQLite, uma fila em memória ou persistida de forma simples, workers e uma interface fina de CLI ou dashboard.

## 2. Contexto do desafio FinGuard

O desafio apresenta um conjunto de reclamações de clientes de uma instituição financeira. Cada registro contém texto livre e precisa ser transformado em informação operacional útil. O primeiro recorte de classificação discutido foi:

- categoria da reclamação;
- produto ou área afetada;
- urgência;
- indicadores de risco, fraude ou segurança, quando aplicável;
- eventualmente uma política interna relacionada;
- resumo legível para encaminhamento ou acompanhamento.

As opções iniciais podem ser mantidas fechadas e explícitas:

```text
categoria:
  - cobrança indevida
  - atendimento
  - fraude/segurança
  - produto/serviço
  - cancelamento
  - outros

produto:
  - cartão de crédito
  - conta corrente
  - empréstimo
  - investimentos
  - seguros
  - não identificado

urgência:
  - baixa
  - média
  - alta
  - crítica
```

Esse conjunto fechado é importante porque transforma parte do problema em decisão tipada, mensurável e avaliável. Resumo e explicação são problemas diferentes: exigem geração de texto, têm outra superfície de erro e devem ser avaliados separadamente.

## 3. Crítica à arquitetura original

A arquitetura inicialmente imaginada era grande demais para a POC: vários agentes, LangGraph, RAG, relatório gerencial e possivelmente múltiplas integrações antes de provar que a classificação básica funcionava.

O problema desse desenho não é que seus componentes sejam inválidos. O problema é a ordem e a mistura de responsabilidades. Ele introduz simultaneamente:

- classificação;
- roteamento;
- geração;
- recuperação de conhecimento;
- orquestração;
- observabilidade;
- avaliação;
- possivelmente agentes com ferramentas.

Com isso, fica difícil responder às perguntas fundamentais:

- A classificação em português é útil?
- O modelo local é suficientemente confiável?
- Qual é a taxa de casos ambíguos?
- Quanto de geração realmente é necessário?
- O scheduler reduz o tempo dos casos críticos?
- A melhoria observada vem do modelo, do prompt, da fila ou da infraestrutura?

A decisão foi reduzir a arquitetura e construir evidência incrementalmente. Cada componente novo deve existir porque uma métrica ou uma necessidade do domínio o justificou.

## 4. Tese arquitetural

O projeto separa três papéis semânticos:

```text
Laya/Jev       = decidir
PolicyStore    = encontrar regras e contexto aplicável
LLM generativo = sintetizar, resumir ou revisar
Scheduler      = decidir quando gastar compute caro
Benchmark      = verificar se a composição funciona
```

Essa separação é preferível a uma abstração universal `Provider`, porque Laya, Jev, Haiku e Kimi não fazem a mesma coisa, mesmo sendo modelos ou serviços de IA.

```text
DecisionModel
├── Laya local
├── Jev API
├── fallback decisório
└── mock determinístico

GenerativeModel
├── Claude Haiku
├── Kimi
├── outro modelo compatível
└── mock para testes

Pipeline
├── decision model
├── optional fallback decision model
├── policy retriever
├── scheduler
├── generative model
└── evaluator
```

O benchmark passa a ser o núcleo arquitetural da POC. O pipeline de produção é uma execução de benchmark sem necessariamente possuir rótulos gold. Isso evita construir um sistema FinGuard e, em paralelo, um benchmark incompatível com ele.

## 5. Escopo incremental

### V0 — baseline local

```text
CSV → normalização → Laya → JSONL/SQLite
```

Escopo:

- ler o dataset;
- normalizar texto e identificador;
- perguntar categoria, produto e urgência ao Laya;
- registrar probabilidade/confiança e latência;
- salvar resultados estruturados;
- inspecionar manualmente uma amostra.

Sem UI, RAG, agentes, fila distribuída ou LLM generativo.

### V1 — avaliação

Adicionar um pequeno gold dataset rotulado por revisão humana e medir:

- accuracy;
- precision, recall e F1 por campo;
- matriz de confusão;
- erro de urgência;
- calibração de confiança;
- taxa de falso negativo em casos críticos;
- latência P50/P95.

### V2 — pipeline híbrido

```text
reclamação
    │
    ▼
Laya: decisão estruturada
    │
    ├── confiança suficiente → resultado estruturado
    │
    └── baixa confiança/risco/inconsistência → LLM
                                          │
                                          ├── revisa decisão
                                          └── gera resumo
```

Registrar tokens, custo estimado, motivo do fallback e latência de cada estágio.

### V3 — prioridade e workers

```text
entrada → decisão rápida → priority queue → workers → resumo/revisão → persistência
```

Introduzir urgência como prioridade operacional, com aging para evitar starvation e limites de concorrência separados por estágio.

### V4 — políticas estruturadas

Adicionar `PolicyStore` e retrieval apenas quando o fluxo realmente precisar responder ou justificar algo com base em políticas internas.

### V5 — dashboard e comparação sistemática

Construir uma interface sobre o mesmo core para explorar runs, amostras, métricas, falhas, filas e comparações de composição.

### Futuro — benchmark de runtime

Com o pipeline e os inputs fixos, comparar Node e Python, incluindo startup, carregamento do modelo, memória, batch, concorrência e latência. Esse eixo deve ficar separado do benchmark de qualidade de modelos.

## 6. Laya e Jev como modelos de decisão

Laya foi escolhida para a POC local porque implementa decisões tipadas sem geração autoregressiva. A interface conceitual trabalha com perguntas como:

- `choice`: escolher uma opção entre categorias;
- `score`: atribuir um valor ou faixa ordenada;
- `noul`: avaliar se uma afirmação é suportada, desconhecida ou falsa, conforme a semântica adotada.

Exemplo conceitual:

```python
questions = [
    choice("categoria", ["cobranca_indevida", "atendimento", "fraude", "outros"]),
    choice("produto", ["cartao", "conta", "emprestimo", "seguros", "nao_identificado"]),
    score("urgencia", ["baixa", "media", "alta", "critica"]),
]

decision = laya.decide(state=complaint_text, questions=questions)
```

O valor arquitetural é obter várias decisões sobre o mesmo estado em uma passagem ou lote, sem pedir ao modelo que gere uma explicação textual para cada campo.

Jev ocupa o mesmo papel semântico, mas normalmente como API fechada. A comparação Laya versus Jev deve medir qualidade, confiança, latência, disponibilidade e custo, sem presumir que resultados publicados se transferem para o dataset FinGuard.

### Cuidado com confiança

Confiança alta não deve significar automaticamente “aceitar”. A discussão registrou o risco de decisões confiantes e erradas, especialmente quando uma reclamação contém intenções múltiplas.

Uma regra mais segura combina:

```text
confiança
+ indicadores de risco
+ consistência entre campos
+ consistência com política recuperada
+ regras de negócio
```

Exemplo:

```text
categoria = atendimento       0.93
fraude    = verdadeiro        0.95
política recuperada = fraude  0.97

→ possível inconsistência semântica
→ revisão ou escalonamento
```

Os thresholds devem ser calibrados no domínio e versionados como configuração do run.

## 7. Scheduler, urgência, priority queue e workers

O scheduler existe para materializar uma hipótese operacional: throughput agregado não é suficiente; é preciso reduzir o tempo até tratar os casos críticos.

### Prioridade

Uma prioridade inicial pode ser composta por:

```text
priority = urgency_weight
         + risk_weight
         + age_boost
         + manual_override
```

Exemplo de ordenação:

```text
crítica + fraude + antiga       → prioridade máxima
crítica + sem risco             → alta
alta + fraude                   → alta
média + antiga                  → pode superar média nova
baixa                           → normal
```

Não usar apenas uma fila FIFO se o objetivo é priorização. Porém, também não usar prioridade pura sem aging: itens de baixa urgência podem ficar indefinidamente atrasados.

### Workers

Separar os limites de concorrência por estágio:

```text
decision_workers   = 1..N local
retrieval_workers  = 1..N conforme storage
generation_workers = pequeno e limitado por custo/rate limit
```

Cada worker deve registrar:

- quando recebeu o item;
- quando começou o estágio;
- quando terminou;
- tempo de espera na fila;
- tentativa e retry;
- erro e motivo;
- tokens e custo quando houver geração.

### Métrica que demonstra a tese

Dois pipelines podem processar 500 itens em tempos parecidos e ainda ter comportamentos operacionais muito diferentes:

```text
Pipeline A: total 38 s; P95 do resumo crítico 21 s
Pipeline B: total 41 s; P95 do resumo crítico 2,1 s
```

O B pode ser melhor para o negócio, mesmo com throughput global ligeiramente menor.

## 8. Resumo assíncrono e fallback

Resumo não deve bloquear a classificação inicial. O caminho ideal é:

```text
1. persistir entrada
2. classificar rapidamente
3. persistir decisão
4. calcular urgência/prioridade
5. enfileirar resumo somente quando necessário
6. executar geração em worker
7. persistir resumo e metadados
```

O resumo pode ser solicitado por:

- urgência alta ou crítica;
- necessidade operacional explícita;
- confiança baixa;
- risco/fraude;
- política que exige explicação;
- amostra de avaliação.

O LLM pode fazer duas funções diferentes, que devem ser diferenciadas no schema:

1. `summarization`: produzir um resumo;
2. `decision_review`: revisar uma decisão do modelo decisório.

Não atribuir ao LLM a classificação de todos os registros apenas porque ele também produz o resumo.

## 9. RAG, políticas internas e quando não usar RAG

RAG não é necessário para a classificação inicial de categoria, produto e urgência. O texto da reclamação já contém o sinal principal, e adicionar um banco vetorial cedo introduziria custo e uma nova fonte de variabilidade.

RAG passa a fazer sentido quando a pergunta depende de conhecimento externo ao registro:

- “qual política interna se aplica?”;
- “qual prazo ou procedimento deve ser seguido?”;
- “esta situação viola uma regra específica?”;
- “qual evidência da política sustenta o encaminhamento?”

Mesmo nesse caso, a primeira implementação deve preferir retrieval estruturado a um banco vetorial genérico.

### PolicyStore

O `PolicyStore` pode começar como SQLite ou arquivos versionados:

```text
Policy
├── id
├── version
├── title
├── domain
├── category
├── product
├── risk_tags
├── urgency_constraints
├── effective_from
├── effective_until
├── text
├── source
└── content_hash
```

O retrieval inicial pode combinar filtros e busca textual:

```text
1. filtrar por produto/categoria/risco
2. filtrar por vigência
3. buscar termos relevantes
4. ordenar por especificidade
5. retornar os trechos e IDs das políticas
```

O resultado do retrieval deve ser persistido, incluindo `policy_ids`, versões, scores e hash do conjunto recuperado. Isso permite reproduzir uma decisão mesmo quando as políticas mudarem.

Vector DB, embeddings e reranking podem ser adicionados apenas quando a busca estruturada demonstrar insuficiência.

## 10. Auto-incremento via eval dataset, não autoaprendizado de política

O sistema não deve alterar sua política automaticamente com base nas próprias previsões. Isso criaria um ciclo de autoafirmação e tornaria difícil saber por que o comportamento mudou.

O padrão desejado é:

```text
produção
   ↓
caso difícil/erro/revisão humana
   ↓
candidato a regression case
   ↓
revisão e inclusão no eval dataset
   ↓
novo benchmark run
   ↓
comparação com baseline
```

O dataset de provas pode crescer de forma semi-automática, mas a política e os rótulos devem passar por uma etapa explícita de revisão.

Exemplo de caso de regressão:

```json
{
  "id": "REC-123",
  "input": "me cobraram duas vezes...",
  "gold": {
    "category": "cobranca_indevida",
    "product": "cartao",
    "urgency": "alta",
    "policy": "POL-17"
  },
  "source": "human_review",
  "reason": "urgency underestimated"
}
```

## 11. Benchmark como entidade de primeira classe

O benchmark não é apenas uma tela de métricas. Ele é um objeto persistido que descreve o experimento, suas entradas, composição, execução e resultados.

### Entidades principais

```text
Benchmark
├── id
├── name
├── description
├── dataset_id
├── evaluation_definition
└── created_at

BenchmarkRun
├── id
├── benchmark_id
├── status
├── pipeline_config
├── reproducibility_metadata
├── started_at
├── finished_at
└── aggregate_metrics

SampleExecution
├── run_id
├── sample_id
├── decision result
├── fallback result
├── retrieval result
├── generation result
├── stage timings
└── errors
```

### Métricas por estágio

Decision model:

- accuracy por campo;
- precision, recall e F1;
- matriz de confusão;
- MAE ou distância ordinal para urgência;
- calibração;
- falso negativo crítico;
- latência P50/P95;
- taxa de decisão válida.

Retrieval/políticas:

- recall@k;
- precision@k;
- política correta em primeiro lugar;
- cobertura de casos que exigem política;
- taxa de contexto insuficiente.

Generation:

- qualidade do resumo;
- factualidade/faithfulness;
- aderência à política;
- completude;
- tokens de entrada e saída;
- latência;
- custo estimado;
- taxa de erro e retry.

Sistema:

- throughput;
- tempo de espera na fila;
- tempo até resumo crítico;
- latência end-to-end;
- custo total;
- memória de pico;
- CPU/GPU;
- taxa de fallback;
- taxa de itens pendentes.

## 12. Reprodutibilidade do `benchmark_run`

Esta é uma decisão de V0. Os números só são comparáveis quando sabemos com que dados, código, configuração e ambiente foram produzidos.

### Metadata obrigatória

```text
run_id
benchmark_id
git_commit
dataset_name
dataset_version
dataset_hash
questions_hash
policy_hash
config_hash

decision_model.provider
decision_model.name
decision_model.version
decision_model.revision

fallback_model.provider
fallback_model.name
fallback_model.version

generative_model.provider
generative_model.name
generative_model.version

thresholds
generation_parameters
retrieval_configuration
queue_strategy
concurrency
batch_size
runtime
hardware
python/node version
started_at
finished_at
```

### Hashes

```text
dataset_hash   = sha256(canonical_dataset)
questions_hash = sha256(canonical_questions)
policy_hash    = sha256(canonical_policy_snapshot)

config_hash = sha256(canonical_json({
  model_versions,
  questions_hash,
  policy_hash,
  thresholds,
  generation_parameters,
  retrieval_configuration,
  execution_configuration
}))
```

Comparação entre runs:

```text
Run 21 → Run 22: questions_hash mudou
→ experimento de comportamento

Run 22 → Run 23: concurrency 4 → 16
→ experimento de execução

Run 23 → Run 24: Python → Node
→ experimento de runtime
```

`config_hash` igual indica uma réplica da mesma configuração experimental, embora serviços remotos ainda possam apresentar variação temporal.

## 13. Composição de pipeline

O benchmark deve comparar composições, não somente providers.

```yaml
run:
  dataset: finguard-v1

pipeline:
  decision:
    provider: laya
    model: laya-multilingual
  generator:
    provider: anthropic
    model: claude-haiku
  policy:
    strategy: structured
  fallback:
    enabled: true
    provider: jev
    threshold: 0.65

execution:
  decision_concurrency: 4
  generation_concurrency: 8
  priority_queue: true
  queue_strategy: urgency_then_age
```

Variações úteis:

```text
Laya + Haiku
Laya + Kimi
Jev  + Haiku
Jev  + Kimi
Laya → Jev + Haiku
Laya → Jev + Kimi
```

Uma troca de Haiku por Kimi não deveria alterar a acurácia da classificação, pois a decisão ocorre antes da geração. Se alterar, há acoplamento indevido ou a avaliação está misturando estágios.

## 14. Comparação Laya, Jev, Haiku e Kimi

| componente | papel           | local/remoto | saída principal                     | métricas prioritárias                       |
| ---------- | --------------- | -----------: | ----------------------------------- | ------------------------------------------- |
| Laya       | decisão tipada  |        local | escolha, score, noul, probabilidade | qualidade, calibração, latência, memória    |
| Jev        | decisão tipada  |          API | decisão e probabilidade             | qualidade, latência, custo, disponibilidade |
| Haiku      | geração/revisão |          API | resumo ou revisão textual           | qualidade, tokens, custo, latência          |
| Kimi       | geração/revisão |          API | resumo ou revisão textual           | qualidade, tokens, custo, latência          |

Os nomes e versões exatos devem ser registrados no run. Benchmarks de terceiros servem como motivação e hipótese, não como resultado do FinGuard.

## 15. Node versus Python

A comparação de runtime foi explicitamente deixada para depois. Primeiro deve ser estabilizada uma composição e um conjunto de inputs.

```text
MODEL BENCHMARK
dataset fixo
  ├── Laya + Haiku
  ├── Laya + Kimi
  ├── Jev + Haiku
  └── Jev + Kimi

mede: qualidade, latência, tokens, custo, SLA

RUNTIME BENCHMARK
pipeline fixo
  ├── Laya Python
  └── Laya Node/ONNX

mede: startup, load, CPU, RAM, P50/P95,
      throughput, concorrência e batch scaling
```

O port Node/ONNX é interessante porque permite manter o modelo e o contrato de inputs constantes. O risco maior não é executar ONNX; é reproduzir exatamente tokenização, montagem de inputs, calibração e formatação dos resultados.

Go foi considerado, mas não é prioridade para a POC. Um serviço Go chamando Laya por HTTP/gRPC criaria IPC e dois runtimes. Um port nativo exigiria validar tokenizer, inputs e calibração. A interface pode continuar aberta a um futuro adapter, mas Python é o caminho de menor risco para V0.

## 16. Arquitetura de aplicação

### Monólito inicial

```text
                 ┌────────────────────┐
CLI/web adapter ─►  application core  │
                 │                    │
                 │ ingest              │
                 │ decision            │
                 │ scheduler           │
                 │ retrieval           │
                 │ generation          │
                 │ evaluation          │
                 │ persistence         │
                 └─────────┬──────────┘
                           │
                         SQLite
```

O tipo de aplicação é um worker com dashboard, mas CLI e web devem ser adapters do mesmo core. Não duplicar lógica em uma API e em um script.

### Docker Compose

Docker Compose pode encapsular a experiência local:

```text
compose
├── app/worker
├── dashboard ou api opcional
└── sqlite volume
```

Na primeira versão, um único container e SQLite são suficientes. Redis, Postgres, RabbitMQ, Kafka ou Qdrant só entram quando a necessidade for demonstrada.

### SQLite e persistência

SQLite é adequado para:

- dataset importado;
- benchmark e runs;
- decisões por amostra;
- tarefas de fila;
- métricas por estágio;
- snapshots de políticas;
- regressions.

A fila pode começar em memória para V0 e ser persistida em SQLite quando retries, reinício e recuperação passarem a ser requisitos.

## 17. Schemas conceituais

### `complaint`

```sql
CREATE TABLE complaint (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  text TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  created_at TEXT,
  imported_at TEXT NOT NULL
);
```

### `benchmark_run`

```sql
CREATE TABLE benchmark_run (
  id TEXT PRIMARY KEY,
  benchmark_id TEXT NOT NULL,
  status TEXT NOT NULL,
  git_commit TEXT,
  dataset_hash TEXT NOT NULL,
  questions_hash TEXT NOT NULL,
  policy_hash TEXT,
  config_hash TEXT NOT NULL,
  pipeline_config_json TEXT NOT NULL,
  execution_config_json TEXT NOT NULL,
  reproducibility_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
```

### `sample_execution`

```sql
CREATE TABLE sample_execution (
  run_id TEXT NOT NULL,
  complaint_id TEXT NOT NULL,
  status TEXT NOT NULL,
  category TEXT,
  category_confidence REAL,
  product TEXT,
  product_confidence REAL,
  urgency TEXT,
  urgency_confidence REAL,
  risk_json TEXT,
  fallback_triggered INTEGER NOT NULL DEFAULT 0,
  fallback_reason TEXT,
  generation_model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated_cost REAL,
  queue_wait_ms INTEGER,
  decision_ms INTEGER,
  retrieval_ms INTEGER,
  generation_ms INTEGER,
  total_ms INTEGER,
  error_json TEXT,
  PRIMARY KEY (run_id, complaint_id)
);
```

### Resultado JSON por amostra

```json
{
  "sample_id": "REC-2026-00142",
  "decision": {
    "category": { "value": "cobranca_indevida", "confidence": 0.94 },
    "product": { "value": "cartao_credito", "confidence": 0.97 },
    "urgency": { "value": "alta", "confidence": 0.82 },
    "risk": { "fraud": false, "confidence": 0.88 }
  },
  "routing": {
    "priority": 8.4,
    "summary_required": true,
    "fallback_triggered": false,
    "reason": "urgency_high"
  },
  "execution": {
    "decision_model": "laya-multilingual@revision",
    "decision_ms": 43,
    "queue_wait_ms": 12,
    "generation_model": "claude-haiku@version",
    "generation_ms": 1820,
    "input_tokens": 412,
    "output_tokens": 96,
    "total_ms": 1884
  }
}
```

## 18. Fluxo end-to-end

```text
┌──────────┐
│ CSV/API  │
└────┬─────┘
     ▼
┌───────────────┐
│ normalize/hash│
└────┬──────────┘
     ▼
┌─────────────────────┐
│ DecisionModel       │
│ category/product    │
│ urgency/risk        │
└────┬────────────────┘
     ▼
┌─────────────────────┐
│ confidence + rules  │
└────┬───────────┬────┘
     │           │
     │           └──────────────┐
     ▼                          ▼
aceitar                  Priority Queue
                          │
                          ▼
                    ┌──────────────┐
                    │ policy query │
                    └──────┬───────┘
                           ▼
                    ┌──────────────┐
                    │ LLM worker   │
                    │ summary/review│
                    └──────┬───────┘
                           ▼
                    ┌──────────────┐
                    │ SQLite/run   │
                    └──────┬───────┘
                           ▼
                    ┌──────────────┐
                    │ eval/report  │
                    └──────────────┘
```

## 19. Alternativas rejeitadas ou adiadas

### LLM em todos os registros

Rejeitado para o primeiro corte porque mistura decisão fechada com geração, aumenta custo e dificulta medir quanto de trabalho realmente precisa de linguagem generativa.

### Multiagentes desde o início

Adiado porque os agentes não resolvem a pergunta central da POC. Um workflow explícito e alguns adapters são suficientes até que retry, human-in-the-loop ou caminhos complexos exijam uma abstração maior.

### RAG desde o primeiro commit

Adiado porque a classificação inicial não depende de conhecimento externo. A busca de política só deve entrar quando houver perguntas de conformidade, procedimento ou justificativa.

### LangGraph desde o primeiro commit

Adiado. Um `if`, uma fila e workers tornam a hipótese verificável. LangGraph pode ser considerado quando o workflow tiver estados, retries, branching e intervenção humana que justifiquem seu custo.

### Kafka, Redis, Qdrant e Postgres

Adiados para evitar que infraestrutura se torne o projeto. SQLite e uma fila simples cobrem a POC local.

### Go como runtime principal

Adiado. O ganho potencial de memória/I/O não compensa, no início, o custo de integrar ou reproduzir o runtime do modelo.

### Autoaprendizado de política

Rejeitado. O sistema pode sugerir novos casos para avaliação, mas mudanças de política e gold labels precisam ser revisáveis e versionadas.

## 20. Riscos e controles

| risco                              | consequência                         | controle                                           |
| ---------------------------------- | ------------------------------------ | -------------------------------------------------- |
| confiança mal calibrada            | automação de casos errados           | medir calibração e falso negativo crítico          |
| reclamação com múltiplas intenções | classificação confiante e incompleta | permitir multi-label/flag de ambiguidade           |
| dataset pequeno                    | resultados instáveis                 | declarar limitações, usar splits e regressions     |
| política alterada                  | runs incomparáveis                   | snapshot e `policy_hash`                           |
| prompt alterado                    | mudança silenciosa de comportamento  | `questions_hash` e versionamento                   |
| API generativa variável            | ruído em latência/qualidade          | múltiplas réplicas com mesmo `config_hash`         |
| starvation na fila                 | baixa urgência nunca processada      | aging e métricas de espera                         |
| fallback excessivo                 | custo alto e latência pior           | medir fallback rate por motivo                     |
| fallback insuficiente              | erros não revisados                  | thresholds e regras de risco                       |
| acoplamento entre estágios         | métricas difíceis de interpretar     | contratos e métricas separadas                     |
| port Node divergente               | benchmark de runtime inválido        | validar tokenizer, inputs e outputs                |
| vazamento de dados sensíveis       | risco operacional                    | anonimização, logs mínimos e secrets fora do banco |

## 21. Próximos passos recomendados

1. Congelar as taxonomias iniciais de categoria, produto e urgência.
2. Criar um pequeno conjunto de amostra e um gold dataset humano.
3. Implementar o contrato `DecisionModel` com adapter Laya e mock.
4. Rodar V0: CSV → Laya → JSONL/SQLite.
5. Persistir `BenchmarkRun` e `SampleExecution` antes de construir dashboard.
6. Calcular hashes de dataset, perguntas/configuração e commit Git.
7. Medir accuracy, confiança, latência e erros manuais.
8. Adicionar fallback generativo apenas para baixa confiança, risco ou resumo solicitado.
9. Adicionar priority queue e workers, medindo tempo até o resumo crítico.
10. Introduzir `PolicyStore` estruturado somente quando existir uma pergunta de política concreta.
11. Criar regression cases a partir de erros revisados.
12. Comparar Laya + Haiku, Laya + Kimi, Jev + Haiku e Jev + Kimi com dataset e configuração controlados.
13. Só então avaliar Node/Python e, se necessário, Go.

## 22. Critério de sucesso da POC

A POC está suficientemente bem-sucedida quando consegue demonstrar, com dados persistidos:

- classificação útil em português;
- separação clara entre decisão e geração;
- redução mensurável de chamadas/tokens generativos;
- prioridade operacional observável;
- métricas por estágio e end-to-end;
- comparação entre composições;
- reprodução de um run por hashes e versões;
- identificação dos casos em que o modelo local não deve decidir sozinho.

Não é necessário que a primeira versão tenha dashboard sofisticado, agentes, distribuição ou RAG vetorial.

## Apêndice A — referências e repositórios discutidos

As referências abaixo são pontos de partida para implementação e investigação. Resultados, números e claims publicados nesses projetos não devem ser tratados como resultados do FinGuard sem reprodução no ambiente local.

### FinGuard

- [gabiramires/FinGuard_desafio](https://github.com/gabiramires/FinGuard_desafio) — repositório do desafio e contexto do dataset.

### Laya e runtimes

- [NandhaKishorM/laya](https://github.com/NandhaKishorM/laya) — implementação principal do modelo decisório tipado.
- [Laya no site System One Models](https://systemonemodels.org/examples/alternatives/nandhakishorm-laya/) — descrição alternativa e exemplos.
- [mizorewww/laya-mlx](https://github.com/mizorewww/laya-mlx) — runtime MLX para Apple Silicon.
- [receptron/laya](https://github.com/receptron/laya) — port Node/TypeScript via ONNX Runtime.
- [receptron/laya-onnx](https://github.com/receptron/laya-onnx) — bundle/runtime ONNX associado ao port Node.
- [@receptron/laya](https://www.npmjs.com/package/@receptron/laya) — pacote Node/TypeScript.
- [laya-jev-lab](https://github.com/yibie/laya-jev-lab) — medições independentes de Laya/Jev e experimento de cascade.

### Jev e avaliação

- Documentação do [Jev/TypeSafe](https://typesafe.dev/) — consultar a documentação atual da API e dos tipos de decisão.
- [DeepEval](https://deepeval.com/) — referência para organizar avaliações de classificação, RAG e sumarização.
- [LangSmith](https://www.langchain.com/langsmith) — referência de datasets, traces e avaliações; não é requisito da POC.

### Retrieval, serving e infraestrutura

- [Amazon Bedrock Knowledge Bases](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html) — referência de RAG gerenciado; provavelmente excessivo para V0.
- [vLLM](https://docs.vllm.ai/) — referência para serving e batching de LLMs; relevante apenas se a geração local virar gargalo.
- [ONNX Runtime](https://onnxruntime.ai/) — referência para o futuro benchmark Node/Python ou eventual adapter nativo.

## Apêndice B — princípio orientador

O projeto deve contar uma história experimental, não uma história de quantidade de componentes:

```text
primeiro decido barato
depois priorizo o que importa
então gasto compute caro onde há motivo
recupero política quando ela é necessária
meço cada estágio
e transformo erros revisados em regressões reproduzíveis
```

Essa sequência mantém o foco no desafio, cria ganchos de nível intermediário e deixa extensões avançadas — benchmark de custo, tokens, runtime, Node/Python, Go, RAG e dashboard — para quando houver evidência de que são necessárias.
