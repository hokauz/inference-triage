# Gold dataset FinGuard

O CSV do desafio não possui labels confiáveis para categoria, sentimento ou
urgência. O campo `produto` preenchido também é uma informação de entrada, não
um gold label.

Este diretório será populado por revisão humana explícita. Cada caso deve
registrar:

- `sample_id` e `source_text_hash`;
- category, product, sentiment e urgency gold;
- risk/threat flags quando aplicável;
- policy IDs relevantes;
- justificativa e revisor;
- versão do esquema e data da revisão.

Não criar labels automaticamente a partir das previsões do modelo. Erros
revisados podem ser adicionados como regressões, mas precisam de aprovação.

O arquivo `labels-ai-draft-v1.csv` é uma referência gerada com assistência de
IA e permanece com `pending_human_review`. `labels-ai-draft-v2.csv` preserva o
mesmo conteúdo semântico, mas recalcula `source_text_hash` usando
`canonical-text-v1` e registra sua origem. Eles podem ser usados para extrair
quantitativos e comparar runs, mas concordância não significa accuracy.

Para gerar a comparação do benchmark Laya:

```bash
make prepare-labels-v2
make analyze-benchmark
make build-review-queue
```

O resultado fica em `artifacts/v0-laya/full/benchmark_analysis.json` e inclui
cobertura, divergências de hash da fonte, distribuições, concordância por
campo, matrizes de confusão e latência, sem copiar rationale ou texto bruto.
