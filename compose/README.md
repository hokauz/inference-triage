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
