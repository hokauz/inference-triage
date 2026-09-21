# Contrato de ingestão FinGuard v1

Fonte: `data/dataset_finguard_desafio_3.csv` do desafio Future Minds.

| Campo | Obrigatório | Tipo | Regra |
|---|---:|---|---|
| `id` | sim | string | único e preservado da fonte |
| `data_reclamacao` | sim | ISO date | não alterar timezone nem data original |
| `canal` | sim | enum/string | SAC, Ouvidoria, Banco Central, Procon ou Redes Sociais |
| `texto_reclamacao` | sim | string | texto original restrito; nunca output público bruto |
| `produto` | não | enum/string | pode estar vazio; deve ser inferido quando possível |
| `status` | sim | enum/string | Aberta, Em análise ou Resolvida |

O contrato aceita `Procon` porque o fixture do desafio o utiliza, embora não
apareça na distribuição do CSV oficial.

O campo `produto` fornecido é contexto de entrada, não gold label. Uma avaliação
de classificação deve usar labels humanos em `datasets/gold/`.
