# Feedback FinGuard

Esta área recebe somente correções e eventos de revisão humana versionados.
Predições do runtime não são promovidas automaticamente para gold.

- `review_queue.jsonl`: seleção de casos difíceis para revisão, gerada a partir
  de um benchmark e sem texto bruto.
- `corrections.jsonl`: decisões humanas aprovadas e suas justificativas.

Uma correção só pode virar dataset candidato depois de revisão, benchmark e
aprovação explícita.
