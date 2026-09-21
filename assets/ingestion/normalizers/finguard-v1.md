# Normalização FinGuard v1

Regras declarativas iniciais:

- ler CSV como UTF-8 com BOM opcional;
- preservar `id`, texto e valores de origem;
- converter campos vazios para `null` no registro canônico;
- normalizar apenas para busca/comparação: lowercase, remoção de acentos e
  espaços repetidos;
- calcular `text_hash` sobre o texto canônico, sem substituir o original;
- validar datas no formato ISO `YYYY-MM-DD`;
- rejeitar IDs duplicados e campos obrigatórios ausentes;
- registrar contagens de entrada, aceitos e rejeitados.

Detecção de PII, redaction e classificação de ameaça são estágios posteriores e
não devem destruir a entrada restrita.
