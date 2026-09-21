# Inference Triage

Inference Triage é uma POC local e orientada a benchmark para estudar como
decisões baratas podem determinar onde vale a pena gastar computação mais cara.

O cenário inicial é o tratamento de reclamações financeiras, mas a arquitetura
é genérica: cada domínio fornece seus dados, taxonomias, policies e prompts; o
runtime executa a composição e registra evidências comparáveis.

> Primeiro decidimos barato. Depois priorizamos o que importa. Só então usamos
> geração cara quando existe um motivo mensurável.

## O que queremos provar

A hipótese principal é que um pipeline híbrido pode entregar melhor relação
entre qualidade, latência e custo do que enviar todos os itens diretamente para
um LLM generativo.

Queremos medir:

- se um modelo decisório local classifica textos em português;
- quanto da classificação pode ser resolvido sem geração autoregressiva;
- quais casos exigem revisão, resumo ou escalonamento;
- se urgência, risco e idade melhoram a prioridade operacional;
- quanto de latência, tokens e custo são evitados;
- se a composição permanece reproduzível quando modelos, prompts ou runtimes mudam.

O objetivo não é provar que um modelo específico é universalmente melhor. É
tornar explícitas as condições sob as quais cada composição funciona ou falha.

## Princípios

### Decidir é diferente de gerar

Classificação, roteamento e priorização produzem decisões estruturadas. Resumo,
explicação e revisão produzem texto. São responsabilidades diferentes e têm
adapters, métricas e critérios de validação próprios.

### Benchmark é parte do produto

Cada execução deve ser um experimento persistido. Dataset, taxonomia, policies,
prompts, modelos, código e configuração de concorrência precisam ser
identificáveis para que duas execuções possam ser comparadas honestamente.

### Conteúdo não pertence ao runtime

Dados de ingestão, mapeamentos, taxonomias, policies e prompts são assets
explícitos. O runtime não conhece regras específicas de FinGuard nem incorpora
prompts no código.

### Complexidade precisa de evidência

Cada componente novo deve responder a uma métrica, falha, requisito de reprodução
ou limitação operacional observável.

## Arquitetura conceitual

```text
domain pack → ingestão/normalização → decisão barata
                                      ├─ decisão suficiente → resultado
                                      └─ risco/ambiguidade → fila
                                                        → policy retrieval
                                                        → LLM (resumo/revisão)
                                                        → SQLite
                                                           ├─ API
                                                           ├─ web
                                                           ├─ CLI
                                                           └─ exporters
```

O sistema começa como um monólito local. Interfaces são camadas de consumo;
elas não duplicam regras de negócio nem lógica do pipeline.

## Papéis dos modelos

O benchmark compara composições de papéis, não um único `provider` para tudo.

| Papel | Modelo | Responsabilidade | Métricas principais |
|---|---|---|---|
| decisão | Laya local | categoria, produto, urgência, risco e confiança | accuracy, F1, calibração, latência, memória |
| decisão alternativa | Jev/API, depois | outro decisor tipado ou fallback | qualidade, disponibilidade, custo, latência |
| geração | Claude Haiku, depois | resumo ou revisão de casos selecionados | factualidade, tokens, custo, latência |
| geração alternativa | Kimi, depois | outro gerador na mesma composição | qualidade, tokens, custo, latência |
| teste | mock determinístico | validar fluxo sem serviços externos | reprodução e cobertura |

Os nomes e versões concretos serão registrados em cada benchmark run. Números de
terceiros são hipóteses de investigação, não resultados deste projeto.

### Por que não usar um LLM para tudo

Usar um LLM generativo para classificar cada registro desde o primeiro momento
mistura decisão fechada com geração de texto, qualidade da classificação com
qualidade do prompt e custo de decisão com custo de resumo.

Isso dificulta responder à pergunta central: quanto do trabalho realmente
precisa de geração? Um LLM pode retornar uma resposta plausível e, ainda assim,
ser uma medição ruim de custo, latência e confiança para decisões tipadas.

Por isso, a primeira decisão usa um modelo especializado em decisões tipadas,
como Laya, e reserva LLMs generativos para resumo, revisão e casos ambíguos.
Modelos e runtimes do ecossistema [System One Models](https://systemonemodels.org/)
servem como referência e fonte de investigação para esse caminho. A adoção não
significa assumir benchmarks publicados: cada modelo será validado no dataset,
hardware e envelope de execução deste projeto.

O LLM continua importante, mas entra onde sua capacidade de gerar texto agrega
valor mensurável, não como substituto universal de toda decisão.

## Assets e desacoplamento

```text
assets/
├── ingestion/       schemas, mappings e normalizers
├── policies/        conjuntos de regras
├── prompts/         templates para geração/revisão
├── taxonomies/      categorias, produtos, urgências e riscos
└── packs/           referências que compõem um domínio
```

Um `domain-pack` seleciona versões desses assets. Uma composição referencia o
pack; não copia prompts, policies ou taxonomias para dentro do runtime. Isso
permite trocar conteúdo, adicionar domínios e comparar versões sem alterar o
pipeline.

## Organização do código

```text
platform/                 contratos e SQL neutros de linguagem
runtimes/typescript/      primeiro runtime executável
runtimes/python/          futuro port com a mesma fronteira
interfaces/               API, web, CLI e exporters de reports
compose/                  perfis Docker e envelopes de execução dos benchmarks
checks/                   acceptance checks e E2E orientados a milestones
experiments/              composições e definições de benchmark
datasets/                 source, curated, gold e fixtures
```

Cada runtime possui seu próprio `core`, `runner`, `runner/composer` e adapters.
Não existe core de código compartilhado entre linguagens: o desacoplamento
ocorre por contratos, assets e dados persistidos.

Os consumidores de report seguem:

```text
interfaces/* → platform/database/views → SQLite
```

## Evolução planejada

### V0 — baseline local

```text
dataset → normalização → Laya → resultado estruturado → SQLite
```

Foco: fazer funcionar, medir latência e confiança e revisar uma amostra. Sem
dashboard, RAG, agentes ou fila distribuída.

### V1 — avaliação

Adicionar um conjunto `gold` revisado por humanos e medir accuracy, precision,
recall, F1 por campo, matriz de confusão, erro ordinal de urgência, calibração,
falso negativo crítico e latência P50/P95.

### V2 — pipeline híbrido

```text
Laya → confiança/regras → resultado
                    └── caso ambíguo ou prioritário → LLM
```

O LLM resume ou revisa somente quando a política justificar. Cada fallback
registra motivo, tokens, latência, modelo e resultado.

### Urgência como sinal de roteamento

Urgência não é apenas um campo do relatório. Ela é um parâmetro operacional para
priorizar e delegar trabalho caro.

```text
entrada → decisão de urgência/risco → prioridade
                                  ├── crítica/alta → LLM cedo
                                  ├── ambígua     → revisão ou LLM
                                  └── baixa/média → fila posterior ou sem geração
```

O modelo decisório local estima a urgência antes da geração. A política de
roteamento combina esse valor com risco, confiança, idade do item e eventual
override manual. Urgência sozinha não autoriza uma decisão automática de alto
risco.

Essa estratégia testa uma hipótese operacional específica: delegar primeiro os
casos urgentes reduz o tempo até o resumo crítico sem enviar todos os registros
ao LLM. Ao mesmo tempo, adiar ou dispensar geração em itens de baixa prioridade
pode reduzir chamadas, tokens, custo e picos de concorrência.

O benchmark deve comparar pelo menos duas estratégias:

```text
baseline: todos os itens aguardam o mesmo caminho de geração
triage:   urgência/risco/confiança determinam prioridade e delegação
```

As métricas esperadas são taxa de fallback, chamadas e tokens generativos,
custo estimado, P50/P95 de latência, tempo até o resumo crítico, tamanho da fila,
throughput e taxa de casos críticos atrasados. Uma estratégia não será
considerada melhor apenas por reduzir custo se aumentar falsos negativos ou o
tempo de atendimento dos casos importantes.

### V3 — prioridade e workers

Adicionar fila com urgência, risco e aging. Além do throughput, medir tempo de
espera e tempo até tratar o resumo de um caso crítico.

### V4/V5 — policies, retrieval e interfaces

Adicionar `PolicyStore` quando houver perguntas dependentes de conhecimento
externo. Começar com filtros e busca textual antes de embeddings ou vector DB.
Depois, construir API, web, CLI e exporters sobre as mesmas views do banco.

### Benchmark de runtime — depois

Após estabilizar dataset e composição, comparar TypeScript e Python com o mesmo
comportamento lógico: startup, load do modelo, CPU, memória, batch, concorrência,
throughput e P50/P95.

## Execução controlada com Docker Compose

Benchmarks não podem depender de recursos ilimitados do host. Desde o primeiro
benchmark executável, cada composição Docker Compose deve declarar um envelope
explícito de CPU e memória, por serviço e por estágio.

```text
compose/
├── README.md
└── benchmarks/
    └── <profile>/             # futuro compose com limites versionados
```

Um perfil de benchmark deve fixar, no mínimo:

- limite de CPU (`cpus`);
- limite de memória (`mem_limit`);
- número de workers e concorrência;
- batch size;
- arquitetura/runtime da imagem;
- versão ou digest da imagem;
- configuração de GPU, quando aplicável.

O run deve registrar tanto o limite solicitado quanto o ambiente efetivo:
arquitetura, versão do runtime, imagem, CPU/memória disponíveis e timestamps.

Não consideraremos comparáveis dois runs que usam a mesma composição lógica, mas
envelopes de CPU/RAM diferentes. O objetivo é separar melhoria de modelo ou de
pipeline de simples disponibilidade de hardware.

O Compose serve como instrumento de controle experimental, não apenas como
facilidade de inicialização. A infraestrutura distribuída continua fora do
escopo da POC; qualquer execução comparável deve ser limitada, declarada e
reproduzível.

## Checks como TDD executável

Desde a V0, cada milestone deve possuir um contrato executável em `checks/`.
O objetivo é responder se alguém consegue executar a versão atual e obter uma
saída válida, persistida e verificável.

```text
checks/
├── structure/          invariantes da estrutura do projeto
├── contracts/          validação de formatos e invariantes
├── e2e/
│   └── v0/
│       ├── fixtures/   entradas pequenas e determinísticas
│       └── expected/   propriedades e resultados esperados
└── resources/          dados auxiliares dos checks
```

O comando agregador futuro será equivalente a:

```text
./scripts/check v0
```

Ele deverá verificar estrutura, contratos, build, execução E2E, persistência
SQLite, views de report, outputs e códigos de saída. Checks específicos poderão
ser executados isoladamente para acelerar o desenvolvimento.

O E2E da V0 usará um mock determinístico para testar o pipeline sem depender de
rede, modelo ou hardware específicos. Um smoke test separado poderá executar o
Laya real. Isso diferencia falhas de arquitetura, integração, ambiente e
mudanças legítimas no comportamento do modelo.

As asserções devem priorizar propriedades, não snapshots frágeis. Por exemplo:

```text
run.status == completed
sample_count == input_count
urgência pertence à taxonomia ativa
confidence está entre 0 e 1
total_ms >= decision_ms
dataset_hash e config_hash existem
```

Cada nova versão deve primeiro expressar seu comportamento esperado como check,
depois receber a implementação. Assim, o conjunto de checks funciona como uma
especificação viva da evolução V0, V1 e seguintes.

## O que os benchmarks devem responder

### Decisão

- Categorias e produtos estão corretos?
- A urgência é subestimada em casos críticos?
- A confiança acompanha a taxa real de acerto?
- Múltiplas intenções são detectadas?

### Retrieval e geração

- A policy correta foi encontrada e estava vigente?
- O resumo é factual, completo e aderente à policy?
- Quantos tokens, retries e chamadas foram necessários?

### Operação

- Qual é a latência total e o tempo de fila?
- Qual é o tempo até o resumo de casos críticos?
- Qual é a taxa de fallback e quanto de geração foi evitado?
- O throughput melhora sem degradar itens prioritários?

## Reprodutibilidade

Cada run deve registrar pelo menos:

```text
run_id, benchmark_id, git_commit
dataset_name, dataset_version, dataset_hash
taxonomy_hash, policy_hash, prompt_hash, config_hash
modelos e versões
thresholds, queue strategy, batch e concurrency
runtime, hardware e timestamps
```

Alterar prompt, policy, dataset, modelo ou concorrência produz um experimento
diferente. Erros revisados podem virar casos novos no dataset `gold`; isso é
crescimento controlado do conjunto de provas, não autoaprendizado de policies.

## Validação e controles

| Risco | Controle |
|---|---|
| confiança alta e decisão errada | calibração, revisão de risco e gold set |
| múltiplas intenções | flag de ambiguidade e regressões |
| prompt/policy alterada | versionamento e hashes |
| API remota variável | réplicas com o mesmo `config_hash` |
| starvation na fila | aging e métricas de espera |
| fallback excessivo | taxa por motivo, custo e latência |
| vazamento de dados | logs mínimos, anonimização e secrets fora do banco |
| runtimes divergentes | fixtures comuns e contratos compartilhados |

## O que deliberadamente fica para depois

- LLM em todos os registros, pois mistura classificação e geração.
- Multiagentes e LangGraph, até branching, retry ou human-in-the-loop exigirem.
- RAG vetorial, até a busca estruturada demonstrar insuficiência.
- Kafka, Redis, Postgres e Qdrant, pois a POC é local.
- Go, até comportamento e contratos estarem estáveis.
- Dashboard sofisticado, até os dados persistidos serem confiáveis.

## Critério de sucesso

A POC será considerada bem-sucedida quando demonstrar, de forma persistida e
reproduzível:

1. classificação útil em português;
2. separação real entre decisão e geração;
3. redução mensurável de chamadas e tokens generativos;
4. prioridade operacional observável;
5. métricas por estágio e end-to-end;
6. comparação entre composições;
7. identificação dos casos em que o modelo local não deve decidir sozinho.

O projeto não precisa começar como uma plataforma distribuída. Precisa produzir
evidência confiável sobre a composição que está sendo testada.

## Referências

- [FinGuard desafio](https://github.com/gabiramires/FinGuard_desafio)
- [Laya](https://github.com/NandhaKishorM/laya)
- [Laya MLX](https://github.com/mizorewww/laya-mlx)
- [Laya Node/ONNX](https://github.com/receptron/laya)
- [Laya/Jev lab](https://github.com/yibie/laya-jev-lab)
- [Jev/TypeSafe](https://typesafe.dev/)
- [DeepEval](https://deepeval.com/)
- [ONNX Runtime](https://onnxruntime.ai/)

Essas referências orientam investigação. Nenhum número externo é tratado como
resultado do Inference Triage sem reprodução local.
