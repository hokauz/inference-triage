# Curated FinGuard data

Ainda não há uma versão curada. Ela deverá ser produzida por uma transformação
reproduzível a partir do CSV em `datasets/source/finguard/`, preservando:

- `source_row` e `source_text_hash`;
- distinção entre campos fornecidos e campos inferidos;
- status e datas originais;
- referência ao `domain-pack` e à versão do normalizer.

Nenhuma transformação deve publicar o texto bruto ou remover a rastreabilidade
do registro de origem.
