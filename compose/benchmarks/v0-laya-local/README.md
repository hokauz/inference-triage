# V0 Laya local benchmark profile

Perfil otimizado para desenvolvimento local no Mac, separado do benchmark
oficial `v0-laya`. Usa 4 CPUs, 8 GiB, quatro threads ONNX e concorrência 1.

O perfil não deve ser comparado diretamente com runs de `v0-laya`, pois o
envelope de execução é diferente. O bundle em `models/laya/` é montado somente
para leitura e os resultados ficam em `artifacts/v0-laya-local/`.

```bash
make laya-local-smoke
make benchmark-laya-local
```
