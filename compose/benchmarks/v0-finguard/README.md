# V0 FinGuard benchmark profile

Este perfil executa o mock determinístico sobre o CSV completo do FinGuard,
mantendo o mesmo envelope controlado do perfil `v0-mock`:

- rede desativada;
- 1 CPU;
- 512 MiB de memória;
- concorrência 1;
- dataset montado somente para leitura;
- outputs gravados em `artifacts/v0-finguard/full/`.

O arquivo de entrada esperado é:

```text
datasets/source/finguard/dataset_finguard_desafio_3.csv
```

O dataset é local e não é incluído na imagem Docker. O `benchmark.sqlite`
continua restrito ao ambiente local; os arquivos públicos do run podem ser
preservados para comparação de benchmarks.
