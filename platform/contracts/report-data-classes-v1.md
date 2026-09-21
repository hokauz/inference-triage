# Report data classes v1

Consumers must select a data class explicitly. A report output cannot silently
inherit the raw input representation.

| Classe | Conteúdo permitido | Destino |
|---|---|---|
| `raw_restricted` | texto original e PII sintética | ingestão, avaliação controlada |
| `internal_restricted` | decisão, evidência, risk flags e resumo redigido | operadores autorizados |
| `report_public` | agregados, métricas e texto redigido | API, web, CLI e exporters públicos |

`report_public` nunca inclui texto bruto, CPF, conta, cartão, telefone, e-mail,
endereço, nome completo ou URL de exfiltração. Redaction precisa acontecer antes
da camada de consumo, e a view pública deve ser testada separadamente da view
restrita.
