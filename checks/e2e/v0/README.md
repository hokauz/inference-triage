# E2E da V0

O E2E da V0 é determinístico e deve usar um mock de decisão. Ele valida o fluxo
completo:

```text
fixture → ingestão → decisão → output estruturado → report persistido
```

O checker executa o CLI V0 sobre `complaints.csv` e `security.csv`. O runner
recebe `--input`, `--output-dir`, `--pack` e `--mode mock`.

Cada execução deve produzir `benchmark.sqlite`, `benchmark_run.json`,
`sample_executions.jsonl` e `ingestion_report.json`. Um smoke test separado
poderá executar Laya local; ele não substitui este E2E determinístico.
