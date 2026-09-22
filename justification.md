# Justificativa da abordagem híbrida

## Decisão

Adotar o Laya local para decisão, classificação, risco preliminar e roteamento,
reservando um LLM externo para geração de resumos e revisões selecionadas.

O resumo deve ser assíncrono em relação à API de ingestão sempre que possível:

```text
fonte → API de ingestão → Laya → decisão persistida
                              └→ fila → Kimi/Haiku → resumo
```

## Premissas atuais

- O dataset de referência possui 500 registros.
- O benchmark Laya atual processou todos os 500 registros.
- O benchmark foi executado em CPU, com 1 CPU, 1 thread ONNX, concorrência 1 e 3 GiB.
- O tempo observado foi 686,66 s, ou 1,373 s por registro.
- O custo de API do Laya local é US$ 0.
- O adapter atual ainda usa `executionProviders: ["cpu"]`.
- O Laya possui potencial de otimização em GPU, mas esse ganho ainda não foi medido.
- O resumo externo é estimado em 850 tokens de entrada e 100 tokens de saída.
- A distribuição de canais do dataset é usada para estimar a rota expressa do Agente 2.
- Na distribuição observada, 75,8% dos registros usariam a segunda chamada de LLM e
  24,2% seguiriam por regra local.
- O Agente 3 permanece local; a comparação de agents LLM considera Agente 1 e Agente 2.

## Modelos e preços de referência

As projeções usam:

- Kimi K2 Turbo: US$ 1,15 por milhão de tokens de entrada e US$ 8 por milhão de
  tokens de saída.
- Claude Haiku 4.5: US$ 1 por milhão de tokens de entrada e US$ 5 por milhão de
  tokens de saída.

Os preços devem ser atualizados antes de qualquer decisão de produção. Cache,
batch, retries, região, impostos e descontos comerciais não estão incluídos.

## Projeção para 1 milhão de requests

| Composição | Entrada estimada | Saída estimada | Kimi | Haiku |
|---|---:|---:|---:|---:|
| Laya + resumo em todos | 850M | 100M | ~US$ 1.778 | ~US$ 1.350 |
| Laya + resumo nos 315 críticos | 535,5M | 63M | ~US$ 1.120 | ~US$ 851 |
| Agents LLM com rota expressa | 1,426B | 196M | ~US$ 3.208 | ~US$ 2.406 |
| Agents LLM sem rota expressa | 1,619B | 220M | ~US$ 3.622 | ~US$ 2.719 |

## Margem econômica estimada

Comparado a usar LLM na classificação e no risco:

- Laya + Kimi em todos os registros economiza aproximadamente 44%.
- Laya + Haiku em todos os registros economiza aproximadamente 44%.
- Laya + Kimi apenas nos críticos economiza aproximadamente 65%.
- Laya + Haiku apenas nos críticos economiza aproximadamente 65%.

Para 1 milhão de requests, isso representa uma economia estimada de:

- aproximadamente US$ 1.430 a US$ 2.090 com Kimi;
- aproximadamente US$ 1.060 a US$ 1.560 com Haiku.

Esses valores são somente API. A máquina local, a fila, observabilidade, armazenamento
e operação devem ser somados ao custo total.

## Projeção de latência

Com a configuração CPU atual:

| Composição | Latência estimada por request |
|---|---:|
| Laya local | ~1,37 s |
| Laya + resumo síncrono | ~2,4–4,4 s |
| Laya + resumo assíncrono | resposta inicial ~1,37 s |
| Agents LLM sequenciais | ~3,5–8,8 s |

O resumo assíncrono é preferível para uma interface de ingestão porque desacopla a
latência da fonte da disponibilidade do LLM externo.

## Projeção de CPU e GPU

O benchmark atual não mede GPU. Como análise de sensibilidade, foram considerados:

| Cenário Laya | Tempo estimado por registro | Throughput | Tempo para 1M |
|---|---:|---:|---:|
| CPU observado | 1,373 s | 0,73 req/s | 15,9 dias |
| GPU 2x | 0,687 s | 1,46 req/s | 8,0 dias |
| GPU 4x | 0,343 s | 2,92 req/s | 4,0 dias |
| GPU 8x | 0,172 s | 5,82 req/s | 2,0 dias |

Os fatores de 2x, 4x e 8x são hipóteses, não resultados medidos. O ganho real pode
ser limitado por tokenização, transferência CPU/GPU, concorrência, persistência e
overhead do runtime. Micro-batching e múltiplos requests simultâneos precisam ser
avaliados em benchmark dedicado.

## Escolhas arquiteturais

1. Usar Laya para decisões estruturadas e de alto volume.
2. Usar LLM externo para tarefas generativas onde o ganho de qualidade justifique
   custo e latência.
3. Gerar resumo somente para registros críticos ou prioritários quando o requisito
   permitir.
4. Manter a ingestão independente da conclusão do resumo.
5. Persistir a decisão por registro antes de chamar o LLM de resumo.
6. Usar fila, retry limitado, backoff e checkpoint por registro.
7. Medir p95 e p99, não somente a média.
8. Registrar modelo, provider, hardware, versão do runtime, prompts e configuração.

## Quando a abordagem se justifica

A abordagem híbrida é justificável se:

- a qualidade do Laya for aceitável para classificação e roteamento;
- a revisão humana dos casos críticos continuar disponível;
- a taxa de ingestão justificar o custo variável de API;
- o resumo puder ser assíncrono ou seletivo;
- o ganho de GPU for validado antes de contratar capacidade dedicada.

Para baixo volume e prototipação rápida, agents todos LLM podem ser mais simples.
Para ingestão contínua, múltiplas fontes e centenas de milhares ou milhões de
requests, Laya + LLM seletivo oferece melhor previsibilidade de custo, menor
dependência externa e menor latência de ingestão.

## Riscos e validações pendentes

- O ganho real de GPU ainda não foi medido.
- A qualidade do Laya ainda precisa ser comparada com labels ou avaliação humana.
- Os preços de Kimi e Haiku podem mudar.
- Concorrência excessiva pode aumentar latência ou consumo de memória.
- O custo de uma GPU pode superar a economia de CPU em cargas pequenas ou ociosas.
- O fluxo atual precisa de fila, retry, idempotência e recuperação de falhas antes
  de ser tratado como pipeline de ingestão de produção.

## Benchmark futuro obrigatório

Executar o mesmo dataset e a mesma configuração lógica em:

- CPU, concorrência 1;
- GPU, concorrência 1;
- GPU, concorrência 4 e 8;
- GPU com micro-batch;
- Laya sem resumo;
- Laya + Kimi;
- Laya + Haiku;
- agents LLM com e sem rota expressa.

Registrar latência, throughput, p95, p99, uso de CPU/GPU, memória, erros, backlog,
tokens efetivos e custo total por milhão de requests.
