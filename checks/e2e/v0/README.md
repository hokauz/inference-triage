# E2E da V0

O E2E da V0 é determinístico e deve usar um mock de decisão. Ele valida o fluxo
completo:

```text
fixture → ingestão → decisão → output estruturado → report persistido
```

O checker fornece duas variáveis ao runner:

- `V0_INPUT`: fixture JSONL de entrada;
- `V0_OUTPUT_DIR`: diretório temporário para os outputs esperados.

O runner deve produzir `benchmark_run.json` e `sample_executions.jsonl`. Um
smoke test separado poderá executar o Laya real; ele não substitui este E2E.
