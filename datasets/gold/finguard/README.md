# Gold dataset FinGuard

O CSV do desafio não possui labels confiáveis para categoria, sentimento ou
urgência. O campo `produto` preenchido também é uma informação de entrada, não
um gold label.

Este diretório será populado por revisão humana explícita. Cada caso deve
registrar:

- `sample_id` e `source_text_hash`;
- category, product, sentiment e urgency gold;
- risk/threat flags quando aplicável;
- policy IDs relevantes;
- justificativa e revisor;
- versão do esquema e data da revisão.

Não criar labels automaticamente a partir das previsões do modelo. Erros
revisados podem ser adicionados como regressões, mas precisam de aprovação.
