# Acceptance checks

Esta pasta contém a especificação executável dos milestones do projeto. Os
checks verificam o comportamento observável do sistema, não detalhes internos
de uma implementação específica.

- `structure/`: diretórios e fronteiras obrigatórias.
- `contracts/`: formatos, invariantes e compatibilidade.
- `e2e/`: fluxos completos por versão, começando pela V0.
- `resources/`: fixtures e dados auxiliares compartilhados.

O E2E deve ser determinístico usando mocks. Integrações com Laya real ficam em
smoke checks separados. `scripts/` será apenas a camada de entrada para rodar
estes checks.
