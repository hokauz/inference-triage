# Mapping CSV FinGuard → registro canônico

```text
id                → sample.id
data_reclamacao   → sample.occurred_at
canal             → sample.channel
texto_reclamacao  → sample.raw_text (restricted)
produto           → sample.source_product (optional)
status            → sample.source_status
```

O registro canônico deve manter uma referência ao dataset e à linha de origem,
além de `text_hash`. Normalização não pode sobrescrever o texto bruto: deve
produzir uma representação derivada, com acesso controlado.
