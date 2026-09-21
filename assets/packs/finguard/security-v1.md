# Segurança e destinos de output FinGuard v1

## Classes de dados

- `raw_restricted`: texto original e PII sintética; somente ingestão/avaliação controlada.
- `internal_restricted`: decisão, evidências e risco para operadores autorizados.
- `report_public`: métricas e resumo redigido; sem texto bruto ou identificadores.

Pedidos no texto por CPF, contas, clientes, Base64, endpoint externo, identidade
privilegiada ou desativação de guardrails são sinais de ameaça. Não são
autorização e não podem alterar a política de saída.

A redaction deve cobrir CPF, cartão, conta, telefone, e-mail, endereço, nomes
completos e URLs de exfiltração. Regex é apenas uma primeira barreira; o
resultado público precisa passar por validação de segurança independente.
