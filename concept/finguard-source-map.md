# Mapeamento do FinGuard para o Inference Triage

Este documento registra a análise do repositório
`/Users/honor/workspace/pocs/FinGuard_desafio` e a tradução proposta para a
arquitetura deste projeto. O repositório de origem não foi alterado.

Os primeiros assets já foram materializados em `assets/`, o fixture smoke foi
copiado para `datasets/fixtures/finguard/` e o CSV oficial foi colocado
localmente em `datasets/source/finguard/` (ignorado pelo Git por conter
PII-shaped data). O gold dataset continua deliberadamente sem labels.

## Inventário da origem

| Origem | Conteúdo | Papel no Inference Triage |
|---|---|---|
| `analise_desafio.md` | edital, níveis, critérios e restrições | requisitos e critérios de aceitação |
| `ks_politica_interna.md` | `POL-SAC-001`, versão 2.0 | policy set versionado |
| `data/dataset_finguard_desafio_3.csv` | 500 reclamações | dataset principal de ingestão |
| `data/reclamacoes.csv` | 10 exemplos curtos | fixture/manual smoke test |
| `src/schemas.py` | enums e modelos Pydantic | fonte inicial da taxonomia e dos contratos |
| `src/rag.py` | chunking e busca lexical da policy | comportamento de retrieval a reproduzir/avaliar |
| `src/agents/*` | estruturação, risco e consolidação | referência comportamental, não código a copiar |
| `src/ofuscacao.py` | máscara de PII e palavrões | requisitos de segurança para os checks |
| `src/relatorio.py` | dashboard e exporters | requisitos para `interfaces/` |

## Dataset oficial

O arquivo `dataset_finguard_desafio_3.csv` contém 500 IDs únicos e seis campos:

```text
id, data_reclamacao, canal, texto_reclamacao, produto, status
```

Observações verificadas:

- canais: Banco Central (121), Ouvidoria (127), Redes Sociais (119) e SAC (133);
- produtos informados: Conta Corrente (101), Cartão de Crédito (91), Empréstimo (80),
  Investimentos (54) e Seguros (52);
- produto ausente em 122/500 registros (24,4%), portanto inferência é parte real
  do problema;
- status: Aberta (249), Em análise (157) e Resolvida (94);
- datas entre 2025-10-01 e 2026-03-01;
- textos entre 331 e 846 caracteres, mediana de aproximadamente 602;
- o CSV não possui gold labels para categoria, sentimento ou urgência.

O campo `produto` não deve ser tratado automaticamente como rótulo correto: ele
é informação de entrada parcialmente preenchida. Para medir qualidade de
classificação será necessário criar um `gold` revisado por humanos, separado do
CSV original.

O arquivo `data/reclamacoes.csv` tem 10 linhas e inclui `Procon`, canal que não
aparece no CSV oficial. Ele é útil como fixture porque exercita explicitamente a
regra de criticidade de Banco Central/Procon, mas não deve ser confundido com a
distribuição do dataset oficial.

## O dataset também é um conjunto de segurança

Uma triagem textual preliminar encontrou, entre outros padrões:

- reclamações de fraude e transações não autorizadas;
- menções a Banco Central, Procon, Justiça, Compliance e risco reputacional;
- vulnerabilidade financeira ou emocional;
- CPFs, números de conta e outros dados pessoais sintéticos dentro do texto;
- pedidos de exfiltração de dados, uso de Base64, endpoint externo e divulgação
  de informações de terceiros;
- tentativas de prompt injection, como instruções para ignorar guardrails ou
  assumir uma identidade privilegiada.

Esses registros não devem ser removidos automaticamente. Eles devem ser
classificados em dois eixos independentes:

```text
domínio da reclamação → categoria/produto/urgência/risco
ameaça de entrada     → PII, prompt injection, exfiltração, abuso de canal
```

Isso evita que um texto malicioso seja tratado apenas como uma reclamação
comum e cria material para os checks de segurança, higienização e roteamento.

## Política interna traduzida

`ks_politica_interna.md` deve virar o primeiro policy set do domínio FinGuard:

```text
assets/policies/finguard/POL-SAC-001.md
```

Metadados a preservar:

```text
documento: POL-SAC-001
versão: 2.0
vigência: janeiro/2026
classificação: uso interno
```

### Regras de urgência

| Nível | Sinal principal | SLA/prazo | Uso no pipeline |
|---|---|---|---|
| Baixa | dúvida, informação ou insatisfação sem impacto financeiro | até 5 dias úteis | fila padrão; geração pode ser adiada |
| Média | impacto moderado, recorrência ou falha de atendimento | até 3 dias úteis | prioridade intermediária; revisão conforme regra |
| Alta | valor acima de R$ 500, tentativas repetidas ou ameaça regulatória | até 24h | delegação prioritária e acompanhamento |
| Crítica | fraude, violação, regulador, Justiça ou vulnerabilidade extrema | até 4h; contato em até 2h | delegação imediata, risco e escalação |

Urgência será uma saída de decisão e também um sinal de roteamento. Ela não deve
ser a única variável: risco, confiança, idade e override manual entram no cálculo
de prioridade.

### Regras determinísticas de canal

- Banco Central e Procon: urgência automaticamente crítica;
- Ouvidoria: segunda instância, analista sênior e relatório mensal;
- Redes Sociais: resposta pública em até 2h, migração para canal privado e
  monitoramento de repercussão;
- SAC: primeira instância, protocolo e prazo de 5 dias úteis.

A regra Banco Central/Procon é candidata a check determinístico e caminho
expresso sem LLM. Ela não deve depender de retrieval lexical para decidir o
nível crítico.

### Regras por produto

As seções de Cartão, Conta Corrente, Empréstimo, Investimentos e Seguros devem
ser mantidas como policy content, com tags para produto, categoria, urgência,
SLA, ação e responsável. Não devem virar `if` espalhados no runtime.

### Governança e indicadores

Também devem ser preservadas como regras explícitas:

- não expor CPF, conta ou cartão em relatório gerencial;
- seguir LGPD e restringir acesso;
- reter registros por cinco anos quando isso fizer parte do ambiente do desafio;
- monitorar SLA por urgência;
- meta de resolução no primeiro contato de 40%;
- detectar reincidência em três reclamações no período definido.

## Taxonomia a migrar

A taxonomia de `src/schemas.py` pode ser traduzida para assets versionados:

```text
assets/taxonomies/finguard/
├── categories
├── products
├── sentiments
├── urgency
├── risk_levels
└── threat_types
```

Valores iniciais:

```text
categorias: Cobrança Indevida, Atendimento, Fraude/Segurança,
            Produto/Serviço, Cancelamento, Outros
produtos:   Cartão de Crédito, Conta Corrente, Empréstimo,
            Investimentos, Seguros, Não Identificado
sentimento: Positivo, Neutro, Negativo, Crítico
urgência:   Baixa, Média, Alta, Crítica
risco:      Baixo, Médio, Alto, Crítico
```

`threat_types` é uma extensão necessária para representar PII, prompt injection,
exfiltração e abuso de autoridade sem contaminar a categoria de negócio.

## Tradução para a estrutura atual

| Fonte | Destino proposto | Tratamento |
|---|---|---|
| CSV oficial | `datasets/source/finguard/` | preservar original, hash e proveniência; não editar |
| CSV de 10 linhas | `datasets/fixtures/finguard/` | fixture local de smoke/E2E |
| CSV normalizado | `datasets/curated/finguard/` | gerar somente por transformação reproduzível |
| rótulos humanos | `datasets/gold/finguard/` | criar e versionar separadamente |
| colunas do CSV | `assets/ingestion/schemas/` | contrato de entrada |
| valores dos enums | `assets/taxonomies/finguard/` | taxonomia versionada |
| policy Markdown | `assets/policies/finguard/` | snapshot com versão/hash |
| prompts dos agentes | `assets/prompts/finguard/` | separar decisão, risco e resumo |
| regras de roteamento | `assets/packs/finguard/` | referências a policy/taxonomia/prompt |
| relatórios | banco + `interfaces/` | não usar `reports/` como persistência final |

## Lacunas e correções necessárias

1. **Sem gold dataset:** não há como declarar accuracy real sem revisão humana.
2. **Produto pré-preenchido:** deve ser distinguido de rótulo gold.
3. **PII no input:** o armazenamento interno pode manter o original controlado,
   mas outputs de consumo precisam ser redigidos.
4. **Código atual expõe texto original em JSON:** isso não atende completamente a
   regra de não expor PII em reports gerenciais; a nova camada deve separar raw,
   restricted e public/report views.
5. **Ofuscação incompleta:** a origem mascara CPF, telefone e cartão, mas não
   garante nomes, contas e todos os identificadores contextuais.
6. **Regra de canal estreita:** o CSV oficial não tem Procon, mas o fixture tem;
   ambos devem ser aceitos pelo contrato.
7. **RAG lexical:** é boa referência inicial para um documento curto, mas regras
   determinísticas de SLA e roteamento devem ser extraídas para avaliação direta.
8. **Mock heurístico:** serve para smoke/E2E, não para medir qualidade do modelo.

## Ordem recomendada de migração

1. Registrar proveniência e hash dos dois CSVs sem modificar a origem.
2. Copiar a policy para o primeiro policy set, preservando versão e vigência.
3. Migrar enums para a taxonomia FinGuard.
4. Criar o contrato de ingestão e uma transformação canônica reproduzível.
5. Adicionar os três fixtures atuais aos checks V0, incluindo Procon e PII.
6. Criar casos de segurança esperados: redaction, prompt injection e não
   exfiltração.
7. Rotular manualmente um gold set pequeno e versionado.
8. Só então conectar o runner ao dataset completo de 500 registros.

O princípio é preservar a riqueza do desafio como dados e regras versionados,
sem transformar o runtime em uma implementação específica de FinGuard.
