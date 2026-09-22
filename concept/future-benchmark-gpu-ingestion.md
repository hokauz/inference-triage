# Benchmark futuro: ingestão contínua, GPU e geração de resumos

## Objetivo

Medir o comportamento do pipeline em um cenário de ingestão real, com múltiplas
fontes enviando reclamações por uma API, comparando:

1. Laya local + resumo assíncrono via LLM;
2. agentes com LLM na classificação e na análise de risco;
3. execução do Laya em CPU e GPU.

O benchmark de 500 registros existente deve ser tratado como baseline de
inferência local sequencial, não como benchmark completo de ingestão distribuída.

## Baseline já medido

Run: `artifacts/v0-laya/full/`

- dataset: 500 registros;
- execução: completa;
- CPU: 1;
- threads ONNX: 1;
- provider atual: CPU;
- memória: 3 GiB;
- concorrência: 1;
- tempo total: 686,66 s;
- média: 1,373 s por registro;
- throughput: aproximadamente 0,73 registro/s;
- custo de API: US$ 0.

O adapter atual usa `executionProviders: ["cpu"]`. O benchmark futuro deve
alterar explicitamente o provider para GPU e registrar o hardware, driver,
runtime e versão do bundle do modelo.

## Cenários de execução

### Cenário A — Laya + LLM assíncrono

```text
fonte/API → ingestão → fila → Laya → decisão persistida
                              └── evento → fila de resumo → Kimi/Haiku
```

A resposta da API não deve esperar o resumo. Medir separadamente:

- latência de aceite da ingestão;
- latência até a decisão Laya;
- latência até o resumo;
- tempo total até o registro completo;
- backlog da fila de resumos.

Modelos candidatos para resumo:

- Kimi K2 Turbo;
- Claude Haiku 4.5.

### Cenário B — agentes com LLM

Executar o fluxo atual do `FinGuard_desafio`:

```text
API → Agente 1 LLM → roteamento → Agente 2 LLM ou regra expressa → consolidação
```

Registrar separadamente os casos que usam a rota expressa e os que fazem a
segunda chamada de LLM.

## Matriz CPU/GPU

Executar o Laya com:

1. CPU, concorrência 1;
2. GPU, concorrência 1;
3. GPU, concorrência 4;
4. GPU, concorrência 8;
5. GPU com micro-batches, se suportado pelo runtime.

Para cada configuração, executar pelo menos 500 registros e medir:

- latência média, mediana, p95 e p99 por registro;
- throughput sustentado;
- tempo de carregamento do modelo;
- uso de CPU, GPU, memória e memória da GPU;
- comportamento de fila;
- taxa de erro e timeout;
- custo estimado por milhão de registros.

Não assumir ganho linear de GPU. Em requests unitários, tokenização,
transferência CPU/GPU e overhead de API podem limitar o ganho. Micro-batching e
concorrência devem ser medidos separadamente.

## Hipóteses de capacidade para validação

Baseline CPU observado:

| Configuração | Latência estimada | Throughput estimado | Tempo para 1M |
|---|---:|---:|---:|
| CPU observado | 1,373 s | 0,73 req/s | 15,9 dias |
| GPU 2x | 0,687 s | 1,46 req/s | 8,0 dias |
| GPU 4x | 0,343 s | 2,92 req/s | 4,0 dias |
| GPU 8x | 0,172 s | 5,82 req/s | 2,0 dias |

Os fatores 2x, 4x e 8x são apenas cenários de sensibilidade. Substituir pelos
resultados medidos.

## Carga de ingestão

Testar três padrões:

- fluxo constante;
- picos curtos de tráfego;
- múltiplas fontes com taxas independentes.

Cada request deve representar uma reclamação individual. O benchmark deve
observar o comportamento em:

- 10 req/min;
- 30 req/min;
- 60 req/min;
- 100 req/min;
- uma carga de pico definida pelo SLA.

Para cada taxa, medir se a fila estabiliza ou cresce continuamente.

## Comparação de custo para 1 milhão de requests

Hipótese de resumo: 850 tokens de entrada e 100 tokens de saída por resumo.

Estimativa de API, antes de descontos, cache ou retry:

| Composição | Kimi | Haiku |
|---|---:|---:|
| Laya + resumo em todos os registros | ~US$ 1.778 | ~US$ 1.350 |
| Laya + resumo apenas nos 315 críticos do baseline | ~US$ 1.120 | ~US$ 851 |
| Agentes LLM com rota expressa | ~US$ 3.208 | ~US$ 2.406 |

Os valores dependem do modelo específico, tokens reais, cache, batch API,
retries e limites de preço vigentes. Atualizar os preços antes do benchmark.

## Critérios de sucesso

- decisão Laya síncrona dentro do SLA de ingestão;
- fila de resumos estável sob a taxa-alvo;
- nenhum registro perdido em falhas de modelo ou worker;
- retomada por registro após reinício;
- custo por milhão conhecido por composição;
- p95 e p99 registrados, não somente média;
- comparação feita com o mesmo dataset, taxonomia e versão de prompts;
- hardware, runtime, modelo e configuração registrados no artefato do run.

## Melhorias necessárias antes do benchmark

- permitir selecionar `cpu` ou `cuda` no adapter Laya;
- registrar provider de execução no `benchmark_run.json`;
- adicionar fila e worker para resumos;
- persistir estado por registro;
- implementar retry com limite e backoff;
- medir concorrência sem duplicar carregamento desnecessário do modelo;
- adicionar métricas de fila, memória e GPU;
- diferenciar latência de aceite da API, decisão e conclusão do resumo.
