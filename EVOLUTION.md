# Evolution benchmarks

Este documento registra os benchmarks coletados e as mudanças observadas no
pipeline. Ele é um histórico técnico, não um dataset gold. Os labels usados na
comparação ainda são `labels-ai-draft-v2.csv`, derivados de anotação assistida
por IA e pendentes de revisão humana.

## Convenções

- **Categoria**: classificação do problema principal.
- **Produto**: produto afetado, incluindo `Não Identificado`.
- **Urgência e risco**: decisão ordinal após as rules determinísticas.
- **Prioridade/disposição**: roteamento final para geração ou escalonamento.
- **Ameaças**: flags de segurança detectadas pela camada determinística.
- Concordância com labels é uma comparação exploratória; não é accuracy oficial.
- Runs `v0-laya` e `v0-laya-local` usam o mesmo modelo e dataset. A diferença
  principal é o envelope computacional.

## Dataset e assets

Dataset oficial dos benchmarks completos:

```text
datasets/source/finguard/dataset_finguard_desafio_3.csv
500 registros
sha256: 9eeee12207acc207e8595063819039d588a8ab2277d1611756a5f0a34b4cfe37
```

Assets comuns:

```text
pack: finguard-pack-v1
taxonomy: cbd993a25fcb59a1f636caf2e19ee4ead31a5ef06d730aecb354cc2f06560a2d
policy: 78c0f742f75757bf528e7d71d09a7e6ca0faf95b943ea692266516f21401e7fe
prompts: 6f297b0ff0b55c7ac1f785f4e8b2cab10dea3968daad5d21dc728be96c755a10
```

## Runs coletados

| Run | Modelo | Entrada | CPU | Memória | Threads | Concorrência | Status |
|---|---|---:|---:|---:|---:|---:|---|
| `v0-mock/complaints` | mock-finguard-v1 | 3 | 1 | 512 MiB | n/a | 1 | completed |
| `v0-mock/security` | mock-finguard-v1 | 2 | 1 | 512 MiB | n/a | 1 | completed |
| `v0-finguard/full` | mock-finguard-v1 | 500 | 1 | 512 MiB | n/a | 1 | completed |
| `finguard-final` | mock-finguard-v1 | 500 | host | ilimitada | n/a | 1 | completed |
| `v0-laya/smoke` | laya-node-onnx-v1 | 3 | 1 | 3 GiB | 1 | 1 | completed |
| `v0-laya/full` | laya-node-onnx-v1 | 500 | 1 | 3 GiB | 1 | 1 | completed |
| `v0-laya-local/smoke` | laya-node-onnx-v1 | 3 | 4 | 8 GiB | 4 | 1 | completed |
| `v0-laya-local/full` | laya-node-onnx-v1 | 500 | 4 | 8 GiB | 4 | 1 | completed |

Os metadados completos estão em `benchmark_run.json` dentro de cada diretório
de artefatos.

### Última execução registrada

```text
run_id: 15d4e6e0-f665-417c-a0c8-2139e611cf11
perfil: v0-laya-local
início: 2026-09-22T02:14:14.414Z
fim:    2026-09-22T02:24:14.799Z
modelo: laya-node-onnx-v1
```

Este run inclui as instruções que orientam categoria a ignorar `sourceProduct`,
produto a usá-lo como contexto auxiliar e urgência a ignorar esse campo.

## Resultados por tipo de dado

### Cobertura e integridade

| Métrica | Laya oficial | Laya local |
|---|---:|---:|
| Entradas lidas | 500 | 500 |
| Outputs públicos | 500 | 500 |
| IDs ausentes | 0 | 0 |
| IDs extras | 0 | 0 |
| Hash mismatches com `labels-ai-draft-v2` | 0 | 0 |
| Status | completed | completed |

O `labels-ai-draft-v2.csv` preserva o `v1`, recalcula os hashes usando
`canonical-text-v1` e registra sua origem.

### Decisões categóricas

Comparação exploratória contra os 500 labels AI draft:

| Campo | Laya oficial | Laya local |
|---|---:|---:|
| Categoria | 213/500 (42,6%) | **229/500 (45,8%)** |
| Produto | 383/500 (76,6%) | **391/500 (78,2%)** |

O ganho de produto em relação ao run anterior foi o principal efeito do
`sourceProduct` como contexto e do fallback conservador:

```text
produto antes do contexto: 59,2%
produto no run anterior:   76,6%
produto no último run:     78,2%
```

A categoria ainda é o principal ponto de correção. Maiores conflitos:

```text
Fraude/Segurança → Cobrança Indevida: 67
Produto/Serviço   → Cobrança Indevida: 47
Atendimento       → Cobrança Indevida/Produto: 39
```

### Decisões ordinais e roteamento

| Campo | Laya oficial | Laya local |
|---|---:|---:|
| Urgência | 354/500 (70,8%) | **359/500 (71,8%)** |
| Risco | 392/500 (78,4%) | 392/500 (78,4%) |
| Prioridade | 384/500 (76,8%) | 375/500 (75,0%) |
| Disposição | 384/500 (76,8%) | 375/500 (75,0%) |

Distribuição final do Laya:

```text
urgência: Crítica 299, Alta 132, Média 69
risco:    Crítico 287, Médio 146, Alto 67
prioridade: 100 = 315, 70 = 87, 40 = 98
```

### Ameaças e segurança

| Ameaça | Concordância |
|---|---:|
| PII | 443/500 (88,6%) |
| Prompt injection | 487/500 (97,4%) |
| Exfiltração | 474/500 (94,8%) |
| Acesso não autorizado | 475/500 (95,0%) |
| Endpoint externo | 499/500 (99,8%) |

Esses números permaneceram estáveis e não devem ser sacrificados para melhorar
categoria ou produto.

### Performance

| Métrica | `v0-laya` | `v0-laya-local` | Variação |
|---|---:|---:|---:|
| Tempo total | ~13m23s | ~10m02s | ~25% mais rápido |
| Média por amostra | 1.416 ms | 1.194 ms | ~16% menor |
| P50 | 1.400 ms | 1.191 ms | ~15% menor |
| P95 | 1.770 ms | 1.522 ms | ~14% menor |
| P99 | 2.306 ms | 1.643 ms | ~29% menor |
| Máximo | 5.138 ms | 1.978 ms | ~62% menor |
| Carregamento do modelo | 1.374 ms | 1.294 ms | ~6% menor |

O perfil local é adequado para iteração. Seus números não substituem o
baseline oficial.

## Estado da evolução

### Concluído

- runtime TypeScript com mock e Laya/ONNX;
- ingestão CSV com hash canônico;
- persistência restrita em SQLite e views públicas;
- perfil oficial e perfil local isolados;
- labels `v1` preservados e `v2` alinhados tecnicamente;
- persistência de saída preliminar do modelo e razões de policy;
- tabelas de feedback, eventos de revisão e versões de dataset;
- fila de casos difíceis sem texto bruto público.

### Próximos gates

1. Executar `make laya-local-smoke` após o ajuste das instruções do Laya.
2. Executar `make benchmark-laya-local`.
3. Executar `make analyze-benchmark` usando `labels-ai-draft-v2.csv`.
4. Recuperar categoria para pelo menos 47% sem perder produto em 76% ou mais.
5. Revisar casos `Fraude/Segurança → Cobrança Indevida` e
   `Produto/Serviço → Cobrança Indevida`.
6. Promover correções humanas para dataset candidato somente após revisão.
7. Repetir `make benchmark-laya` para validar a baseline oficial.

## Gates do último run

| Gate | Resultado | Status |
|---|---:|---|
| Entradas e predictions | 500/500 | PASS |
| Hash mismatches | 0 | PASS |
| Produto ≥ 76% | 78,2% | PASS |
| Categoria ≥ 47% | 45,8% | FAIL |
| Urgência ≥ 70% | 71,8% | PASS |
| Risco ≥ 78% | 78,4% | PASS |
| Prioridade ≥ 76% | 75,0% | FAIL |
| Disposição ≥ 76% | 75,0% | FAIL |
| Ameaças sem regressão | igual ao run anterior | PASS |
| Status do run | completed | PASS |

### Leitura do último run

O ajuste de contexto melhorou a classificação categórica e de produto em
relação ao run local anterior:

```text
categoria: 42,6% → 45,8%
produto:   76,6% → 78,2%
urgência:  70,8% → 71,8%
```

Entretanto, o roteamento mudou:

```text
priority_requested: 123 → 87
deferred:            62  → 98
```

Isso reduziu a concordância de prioridade/disposição para 75,0%. O próximo
ajuste deve investigar a fronteira entre `Alta`/`Média` e as rules de routing,
sem alterar as regras de risco ou segurança prematuramente.

## Ciclo futuro de melhoria

```text
execução
  → decisão do modelo
  → persistência de decisão, confiança e policy reasons
  → review_queue de casos difíceis
  → revisão humana em sample_feedback/review_events
  → dataset candidato versionado
  → benchmark completo
  → gates de não-regressão
  → promoção explícita de policy/taxonomia/modelo
```

O runtime não promove labels, prompts, policies ou modelos automaticamente.
Cada promoção deve manter hashes, revisão humana, benchmark e aprovação
explícita.

## Referências de artefatos

- [Análise Laya oficial](artifacts/v0-laya/full/benchmark_analysis.json)
- [Análise Laya local](artifacts/v0-laya-local/full/benchmark_analysis.json)
- [Run Laya oficial](artifacts/v0-laya/full/benchmark_run.json)
- [Run Laya local](artifacts/v0-laya-local/full/benchmark_run.json)
- [Labels AI draft v2](datasets/gold/finguard/labels-ai-draft-v2.csv)
- [Fila de revisão](artifacts/v0-laya-local/full/review_queue.jsonl)
