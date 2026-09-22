# Docker Compose

Esta pasta reserva os perfis de execução dos benchmarks. Cada perfil deverá
declarar limites explícitos de CPU e memória, concorrência, batch e imagem para
que os resultados sejam comparáveis entre runs.

O perfil `benchmarks/v0-mock/` executa o runner V0 sem rede, com 1 CPU e 512 MiB
de memória. A imagem é construída com Bun e executada por Node 25.

O perfil `benchmarks/v0-finguard/` usa o CSV completo local em
`datasets/source/finguard/`, com o mesmo envelope de recursos, e grava os
outputs em `artifacts/v0-finguard/`. Ele é executado por `make
benchmark-finguard`.

O perfil `benchmarks/v0-laya/` executa o adapter real Node/ONNX. Ele exige um
bundle local preparado em `models/laya/multilingual/`, montado somente para
leitura, e é executado por `make benchmark-laya`.

O envelope de memória do Laya é separado do mock: o mock usa 512 MiB, enquanto
o Laya começa com 3 GiB para acomodar o modelo ONNX carregado e o batch.

O perfil `benchmarks/v0-laya-local/` é um envelope separado para iteração local,
com 4 CPUs, 8 GiB, quatro threads ONNX e concorrência 1. Seus resultados ficam
em `artifacts/v0-laya-local/` e não devem ser comparados diretamente com o
perfil oficial de 1 CPU/3 GiB.
