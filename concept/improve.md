Pesquisei os benchmarks que apareceram desde o lançamento do Jev e, principalmente, os que tentam colocar **Jev e Laya na mesma tarefa**. A evidência ainda é muito recente — Jev foi lançado em 15/09/2026 e Laya apareceu poucos dias depois — mas já dá para separar algumas coisas importantes.

A conclusão principal é: **há cenários em que Laya parece atingir ou superar Jev em accuracy, mas ainda não há evidência robusta de que Laya seja globalmente tão bom quanto Jev.** O resultado depende muito de especialização, número de classes e calibração. E isso é particularmente importante para o benchmark que discutimos ontem.

## O benchmark mais interessante hoje

O melhor ponto de comparação que encontrei é o `LocalLLaMA/typed-decisions`: **400 casos / 2.000 decisões**, divididos entre customer service, invoice processing, security incidents e agent-trace observability. Ele mede `choice`, `score` e `noul`, portanto está bem próximo do tipo de primitive que estamos interessados em benchmarkar. :chatgpt-content-reference{index="0"}

Existe agora uma execução independente do Jev 1.13.0 sobre esse dataset:

| Métrica     |             Jev 1.13 |       Laya base | Laya typed-decisions |
| ----------- | -------------------: | --------------: | -------------------: |
| Accuracy    |          ~72.7–74.0% |            ~36% |            **76.6%** |
| Brier ↓     |                0.148 |           0.316 |            **0.062** |
| ECE ↓       |   **~0.045–0.144\*** |           0.175 |                0.213 |
| Score MAE ↓ |                0.389 |           0.694 |            **0.242** |
| Latência    | ~687–710 ms/case API | ~16–40 ms local |         ~16 ms local |

\* Há divergência entre implementações de ECE. Uma execução independente recente do Jev obteve **0.045**, enquanto o número anteriormente publicado usado pelo Laya era 0.144. Isso reforça por que eu não trataria o ECE publicado pelo próprio Laya como comparação definitiva. :chatgpt-content-reference{index="1"}

A diferença de velocidade, portanto, é real. Em T4, o Laya mede aproximadamente **33–40 ms para uma pergunta**, chegando a ~7 ms/question em batch. Em RTX 5090 há medição de ~10.7 ms single e ~4–5 ms/question em batch. :chatgpt-content-reference{index="2"}

Mas há uma pegadinha enorme nessa tabela.

### Laya base ≠ Laya typed-decisions

O resultado de **76.6%** vem de um checkpoint de Laya especificamente fine-tuned no training split desse mesmo benchmark.

O próprio model card reconhece isso:

> é um specialist treinado nos quatro workflows do dataset; fora deles, espera-se comportamento semelhante ou pior que o Laya base. :chatgpt-content-reference{index="3"}

E o Laya base faz:

**36.2% accuracy.**

Ou seja:

**Jev generalista: ~73–74%  
Laya generalista: ~36%  
Laya especializado: ~76.6%**

Isso muda completamente a interpretação de "Laya é mais preciso que Jev".

---

## Um benchmark que expõe exatamente esse problema

Encontrei uma comparação independente particularmente útil porque usou **PhishNChips, 2.000 emails**, que nenhum dos dois teria sido treinado especificamente para resolver.

Resultado:

|                 | Laya raw | Laya calibrado |       Jev |
| --------------- | -------: | -------------: | --------: | ------------------------------------- |
| Accuracy        |    50.5% |          61.1% | **62.6%** |
| AUROC           |    0.678 |          0.679 | **0.689** |
| Recall phishing | **1.2%** |              — | **43.2%** |
| ECE             |    0.441 |              — | **0.154** |
| p50             | **9 ms** |       **9 ms** |    239 ms | :chatgpt-content-reference{index="4"} |

Esse benchmark é bastante revelador.

Laya raw praticamente diz **"não é phishing" para tudo**. Por isso fica em ~chance accuracy.

Mas observe o AUROC:

**0.678 Laya vs 0.689 Jev.**

Isso significa que Laya aprendeu bastante informação útil sobre o problema. O ranking dos exemplos é quase tão bom quanto Jev. O grande problema está no **threshold/calibration**, não necessariamente na representação semântica.

Quando fazem Platt calibration:

**50.5% → 61.1%.**

Jev fica em 62.6%.

Portanto, nesse domínio:

> Laya calibrado ≈ Jev em accuracy, mantendo uma diferença enorme de latência.

Essa é provavelmente a evidência mais interessante que encontrei para a sua pergunta.

---

# Onde Laya pode efetivamente ser melhor

A evidência atual aponta para três regiões.

**1. Domínio estreito + fine-tuning**

Aqui Laya fica extremamente interessante.

No typed-decisions especializado:

- Jev: ~73–74%
- Laya: 76.6%

E por primitive:

- `noul`: **85.7%**
- `choice`: **73.3%**
- `score`: **72.3%** :chatgpt-content-reference{index="5"}

Para uma aplicação em que você sabe antecipadamente quais decisões serão tomadas, o modelo pequeno especializado pode competir muito bem com o modelo generalista.

Isso encaixa diretamente na arquitetura que estávamos discutindo.

---

**2. Binary/ranking após calibração**

O phishing é um ótimo exemplo.

O Laya tinha:

`AUROC 0.678`

contra:

`Jev 0.689`.

Apesar da accuracy inicialmente horrível.

Isso sugere uma arquitetura bastante interessante:

```text
encoder pequeno
      ↓
raw score
      ↓
calibration por domínio
      ↓
decision threshold
      ↓
confidence / abstention
```

Em outras palavras, talvez seja errado avaliar Laya simplesmente como:

```text
input → Laya → resposta
```

Ele pode ser muito mais competitivo como:

```text
input
 ↓
Laya
 ↓
domain calibrator
 ↓
decision
```

E o calibrador pode ser extremamente barato.

---

**3. Throughput**

Aqui não parece haver muita discussão.

Em RTX 5090:

````text
1 question    10.7 ms
10             4.3 ms/question
50             4.9 ms/question
100            5.0 ms/question
``` :chatgpt-content-reference{index="6"}


Em T4:

```text
single      ~33–40 ms
batch       ~7 ms/question
``` :chatgpt-content-reference{index="7"}


Jev tem a desvantagem adicional de ser API. Então há network latency, enquanto Laya pode estar no mesmo processo/máquina que o pipeline.

Para centenas ou milhares de classificações, isso é estruturalmente diferente.

---

# Onde Jev continua claramente mais forte

Tem uma região em que encontrei uma diferença enorme: **muitas classes**.

No Banking77:

```text
Jev          87.0%
Laya         42.5%
``` :chatgpt-content-reference{index="8"}


Há uma explicação arquitetural.

Laya possui um budget compartilhado para representar as opções. Com dezenas de labels, cada opção acaba recebendo poucos tokens. O model card sugere aumentar `head_max_len`, mas, out-of-the-box, Jev suporta muito melhor decisões com alta cardinalidade. :chatgpt-content-reference{index="9"}

Portanto eu começaria a desconfiar de Laya em algo como:

```text
choice:
  - billing
  - account
  - security
  - sales
  ...
  - 50 outras classes
````

Enquanto:

```text
is_vulnerability: yes/no
severity: 1..5
needs_review: yes/no
category: [A,B,C,D]
```

parece muito mais adequado.

---

# O ponto mais importante: calibration

Aqui Jev ainda me parece mais convincente.

Uma avaliação independente rodou os **2.000 decisions diretamente pela API Jev** e encontrou:

```text
accuracy     74.0%
ECE           4.5%
```

Mais interessante ainda foi risk/coverage:

````text
threshold       coverage      accuracy

nenhum           100%          74.0%
confidence ≥ .7   57.6%         86.4%
confidence ≥ .9   24.5%         93.7%
``` :chatgpt-content-reference{index="10"}


Isso é extremamente relevante para nosso projeto.

Porque não queremos apenas:

> "qual modelo acerta mais?"

Queremos:

> "quando o modelo diz que tem 95% de certeza, ele realmente tem aproximadamente essa chance de estar certo?"

É isso que permite:

```text
confidence > .95
        ↓
automate

.70–.95
        ↓
LLM / second model

< .70
        ↓
human / abstain
````

Jev parece estar particularmente bom nisso.

---

# Existe também uma evidência contrária interessante

Apareceu ontem um benchmark independente pequeno, com **40 tickets de suporte em chinês**.

Resultado:

```text
                Jev        Laya

overall          78%         57%
clear           100%         75%
ambiguous        70%         60%
boundary         40%         20%
```

Mas a latência:

````text
Jev       588 ms
Laya      7.6 ms
``` :chatgpt-content-reference{index="11"}


Eles então fizeram exatamente o cascade que discutimos:

```text
                Laya
                  │
           confidence ≥ .60
            /             \
          sim             não
           │               │
        aceita            Jev
````

Resultado:

```text
pure Jev
accuracy 78%
latency 588 ms

cascade
accuracy 78%
latency 327 ms
```

Ou seja, **mesma accuracy observada, ~1.8× mais rápido**, resolvendo 45% do tráfego localmente. :chatgpt-content-reference{index="12"}

A amostra é pequena demais para generalizar, mas arquiteturalmente é bastante relevante.

---

# Isso muda um pouco o benchmark que estávamos desenhando

Eu não faria simplesmente:

```text
Laya
vs
Jev
vs
LLM
```

O benchmark deveria medir **configurações de decision pipeline**.

Algo como:

```text
A
Jev

B
Laya raw

C
Laya + calibration

D
Laya fine-tuned

E
Laya → low confidence → Jev

F
Laya → low confidence → LLM

G
classifier especializado → Jev

H
classifier especializado → LLM
```

E cada run deveria guardar aquilo que você apontou ontem:

```text
model
model_version
dataset_hash
prompt/question_hash
model_config
calibration_config
threshold
concurrency
hardware
```

Mais as métricas:

```text
accuracy
macro F1
AUROC
Brier
ECE
risk/coverage
abstention rate
p50
p95
p99
throughput
cost / 1M decisions
```

E eu acrescentaria agora **option-order robustness**. Laya já mostrou sensibilidade relevante à ordem/nome das opções em alguns testes. :chatgpt-content-reference{index="13"}

---

## Minha leitura da evidência atual

Eu representaria o estado atual assim:

```text
                         Laya                 Jev

latency                  +++++                ++
throughput                +++++                ++
self-host                 +++++                -
general zero-shot         ++                   ++++
few classes               ++++                 ++++
many classes              ++                   +++++
domain fine-tuning        +++++                N/A
raw calibration           ++                   +++++
post-calibration          ++++?                +++++
cost at huge scale        +++++                ++++
```

Não trataria os **76.6% vs 72.7%** como evidência de que Laya é "melhor que Jev". O primeiro está fine-tuned especificamente naquele dataset; Jev não está. Há inclusive sinais de memorização/overfitting porque 76.6% ultrapassa o **teacher self-agreement ceiling de 73.5%** do dataset. :chatgpt-content-reference{index="14"}

Mas surgiu algo potencialmente mais importante para o projeto que discutimos: **Laya parece conseguir extrair sinal próximo de Jev em alguns domínios, a uma fração enorme da latência, desde que calibração/especialização façam parte do pipeline.**

Isso faz com que eu não pensasse em **"Laya vs Jev"**, mas em:

**Laya como fast path + Jev/LLM como escalation path.**

E o benchmark mais expressivo não seria simplesmente accuracy. Seria a curva:

**accuracy × coverage × latency × cost**.

Essa curva nos diria, por exemplo: _"consigo resolver deterministicamente 72% das decisões com Laya em <10 ms mantendo ≥95% accuracy, e mando os outros 28% para Jev."_ Esse é um resultado muito mais útil para decidir uma arquitetura real do que descobrir que um modelo obteve 76.6% e outro 74%. :chatgpt-content-reference{index="15"}

[Laya benchmarks e resultados reproduzíveis](https://github.com/NandhaKishorM/laya/blob/main/BENCHMARKS.md?utm_source=chatgpt.com)  
[Laya Typed-Decisions model card](https://huggingface.co/convaiinnovations/laya-typed-decisions?utm_source=chatgpt.com)  
[Benchmark independente Laya × Jev / PhishNChips](https://huggingface.co/datasets/Luni/laya-jev-benchmark?utm_source=chatgpt.com)  
[Avaliação independente do Jev 1.13](https://decisioneval.dev/models/typesafe-jev/?utm_source=chatgpt.com)  
[Dataset typed-decisions e metodologia](https://huggingface.co/datasets/LocalLLaMA/typed-decisions/blob/main/README.md?utm_source=chatgpt.com)

Como esses modelos têm apenas alguns dias e estão surgindo benchmarks novos rapidamente, posso monitorar novos benchmarks independentes de **Laya × Jev** e avisá-lo quando aparecer algo substancialmente mais robusto.

Nesse contexto, **calibrador não é outro LLM**. É uma transformação estatística pequena, aprendida sobre um conjunto de validação, que pega o score/logit produzido pelo Laya e o converte em uma probabilidade ou decisão mais confiável.

Imagine que o Laya produza:

```text
email → Laya → phishing_score = 0.31
```

Mas, empiricamente, você descobre no seu dataset que exemplos com score ~0.31 são phishing em 70% dos casos. O score do modelo tem informação útil, mas sua escala está "deslocada". O calibrador aprende essa relação:

```text
Laya score 0.31 → probabilidade calibrada 0.70
```

Então o pipeline fica:

```text
                  treinamento offline
                         │
               validation dataset
                  ↓           ↓
                Laya       ground truth
                  ↓           ↓
                 scores ──────┘
                    ↓
             fit(calibrator)
                    ↓
              calibrator.bin


                   produção
                      │
input → Laya → raw score → calibrator → probability → decision
                                               │
                                         threshold
                                               │
                                    phishing / benign
```

### Exemplo concreto com Platt scaling

É provavelmente o exemplo mais simples.

Suponha que o Laya gere um **logit** `x`. Você coleta milhares de exemplos:

```text
laya_score    ground_truth

-2.1          0
-1.8          0
-1.2          0
-0.9          1
-0.4          0
 0.1          1
 0.3          1
 0.7          1
 1.2          1
...
```

Você ajusta uma regressão logística:

\[
P(y=1|x)=\sigma(ax+b)
\]

O treinamento só precisa aprender **dois parâmetros**, `a` e `b`.

Digamos que obtenha:

```text
a = 1.73
b = 0.84
```

Produção passa a ser essencialmente:

```python
raw = laya(text)

probability = sigmoid(
    1.73 * raw.logit + 0.84
)

decision = probability >= 0.5
```

O custo computacional do calibrador é praticamente zero.

---

### Por que isso pode aumentar a accuracy?

Porque **ranking e decisão são problemas diferentes**.

Imagine:

```text
                  Laya raw

benign           phishing
  ↓                 ↓

0.10
0.14
0.17
0.22
                  0.27
                  0.31
                  0.35
                  0.39
```

O modelo separou os grupos muito bem.

Mas suponha que o threshold original seja:

```text
0.50
```

Ele classificaria **todos como benign**.

Accuracy parece horrível, apesar de o modelo ter descoberto perfeitamente qual grupo é qual.

Um calibrador poderia descobrir:

```text
threshold efetivo ≈ 0.25
```

e de repente a classificação fica quase perfeita.

Isso explica como você pode ter algo aparentemente contraditório como o exemplo anterior:

```text
Laya
accuracy = 50.5%
AUROC    = 0.678
```

Se o modelo fosse realmente aleatório, esperaríamos AUROC perto de `0.50`. O `0.678` mostra que existe informação no score. A conversão **score → decisão** é que estava ruim.

### Há diferentes níveis de sofisticação

Você poderia começar com algo extremamente simples:

```text
Laya
 ↓
threshold otimizado por validação
 ↓
decision
```

Nem sequer precisa chamar isso de calibrador. Você encontra empiricamente:

```text
threshold = 0.37
```

que maximiza a métrica relevante no validation set.

Depois:

```text
Laya
 ↓
Platt scaling
 ↓
probability
 ↓
threshold
```

Outra opção comum é **isotonic regression**, que não assume a curva logística:

```text
raw score
   ↓
┌─────────────────────────┐
│ empirical mapping       │
│                         │
│ .10 → .03               │
│ .20 → .12               │
│ .30 → .41               │
│ .40 → .67               │
│ .50 → .81               │
│ .60 → .93               │
└─────────────────────────┘
   ↓
calibrated probability
```

Ela precisa de mais dados, mas consegue aprender relações não lineares.

Para multiclass existe, entre outros, **temperature scaling** sobre logits:

\[
p_i = softmax(z_i/T)
\]

Você aprende somente `T`.

---

## E "domain calibrator" é uma distinção importante

Quando escrevi `domain calibrator`, estava pensando especificamente no seu caso de uso.

Não necessariamente teríamos:

```text
Laya → calibrator universal
```

Poderíamos ter:

```text
                    ┌→ security calibrator
                    │
Laya → domain ──────┼→ support calibrator
                    │
                    ├→ vulnerability calibrator
                    │
                    └→ finance calibrator
```

Porque o comportamento do score pode mudar substancialmente conforme a distribuição dos inputs.

Por exemplo:

```text
                  raw Laya score    empirical P(positive)

security              .40                  82%
support               .40                  61%
finance               .40                  34%
```

Um `0.40` não necessariamente significa a mesma coisa nos três datasets.

Isso começa a ficar particularmente interessante para a arquitetura do benchmark que discutimos.

Você poderia tratar **modelo e calibração como componentes independentes**:

```text
BenchmarkRun
│
├── dataset
│
├── classifier
│     ├── model: laya
│     └── version: x
│
├── calibrator
│     ├── type: platt
│     ├── training_dataset_hash
│     ├── parameters
│     └── version
│
└── decision_policy
      ├── threshold: .80
      └── abstain_below: .65
```

Isso permitiria comparar corretamente:

```text
Laya raw
Laya + threshold optimization
Laya + Platt
Laya + isotonic
Jev raw
Jev + calibration
```

E tem uma consequência ainda mais interessante para o **cascade** que estávamos imaginando:

```text
                         calibrated confidence
                                  │
input → Laya → calibrator ────────┤
                                  │
                     ≥ .95        │       < .95
                       ↓          │         ↓
                    decision      │        Jev
                                             │
                                             ↓
                                          decision
```

Aqui a calibração deixa de ser apenas uma maneira de ganhar alguns pontos de accuracy. Ela passa a determinar **quem pode sair pelo fast path**.

Por exemplo, seu benchmark poderia descobrir empiricamente:

```text
Laya calibrated

confidence ≥ .99 → 18% coverage → 99.4% accuracy
confidence ≥ .95 → 43% coverage → 97.1% accuracy
confidence ≥ .90 → 61% coverage → 94.2% accuracy
confidence ≥ .80 → 79% coverage → 88.7% accuracy
```

Então a pergunta arquitetural deixa de ser **"Laya tem 91% de accuracy?"** e passa a ser:

> **Qual percentual do workload o Laya consegue resolver sozinho dentro do nível de erro que eu aceito?**

Para o `prioritize pipeline` que estávamos discutindo, eu considero essa segunda pergunta bem mais importante. Ela transforma `calibration + risk/coverage` em parte de primeira classe do benchmark, em vez de medir apenas accuracy média.

Eu separaria **score**, **confidence** e **decision**. Isso evita um erro conceitual importante: confidence não deveria ser simplesmente o maior score retornado pelo modelo.

Suponha classificação binária:

```text
input → Laya

raw:
  safe:       0.21
  vulnerable: 0.79
```

O `0.79` é o **raw score/probability do modelo**. Depois da calibração:

```text
raw_probability        = 0.79
calibrated_probability = 0.93
```

Se a decisão for `vulnerable`, você pode definir:

```text
confidence = P(decision está correta)

           = 0.93
```

No binário isso é simples:

```python
p = calibrated_probability

if p >= 0.5:
    decision = "vulnerable"
    confidence = p
else:
    decision = "safe"
    confidence = 1 - p
```

Assim:

```text
P(vulnerable) = .93
→ vulnerable
→ confidence .93

P(vulnerable) = .08
→ safe
→ confidence .92

P(vulnerable) = .51
→ vulnerable
→ confidence .51
```

### Para o fallback, porém, eu armazenaria mais que `confidence`

Algo próximo disto:

```json
{
  "decision": "vulnerable",

  "prediction": {
    "raw_score": 0.79,
    "calibrated_probability": 0.93,
    "confidence": 0.93
  },

  "model": {
    "name": "laya",
    "version": "..."
  },

  "calibration": {
    "method": "platt",
    "version": "security-v3"
  },

  "policy": {
    "version": "security-policy-v7",
    "min_confidence": 0.95
  },

  "routing": {
    "accepted": false,
    "reason": "confidence_below_threshold",
    "fallback": "jev"
  }
}
```

Aqui tem uma distinção que considero importante: **não embutir a regra de fallback no confidence**.

O modelo produz:

```text
confidence = .93
```

A policy decide:

```text
required confidence = .95

.93 < .95
→ fallback
```

Isso permite amanhã alterar:

```text
.95 → .90
```

sem mudar Laya, calibrador ou executar novamente os inputs históricos.

---

## E isso fica ainda melhor com risk/coverage

Você pode descobrir no benchmark que:

| Confidence mínima | Coverage Laya | Accuracy observada |
| ----------------: | ------------: | -----------------: |
|               .99 |           15% |              99.7% |
|               .95 |           38% |              98.1% |
|               .90 |           61% |              95.3% |
|               .80 |           82% |              90.2% |
|               .00 |          100% |              84.1% |

Então você não escolhe arbitrariamente:

```text
confidence >= .90
```

Você define um objetivo:

```text
"Quero pelo menos 98% de precisão no fast path."
```

O benchmark mostra:

```text
threshold = .95
```

E produção vira:

```text
                    calibrated confidence
                           │
                         .97
                           │
              ┌────────────┴────────────┐
              │                         │
           >= .95                     < .95
              │                         │
           ACCEPT                    FALLBACK
              │                         │
              ↓                         ↓
        Laya decision                  Jev
```

### O que eu armazenaria para permitir reprocessamento futuro

Eu iria um pouco além do JSON anterior:

```text
DecisionAttempt
├── input_hash
├── model
│   ├── name
│   └── version
│
├── output
│   ├── raw_logits
│   ├── raw_probabilities
│   ├── predicted_class
│   └── calibrated_probabilities
│
├── calibration
│   ├── method
│   ├── version
│   └── dataset_hash
│
├── decision
│   ├── value
│   └── confidence
│
├── policy
│   ├── version
│   └── threshold
│
└── routing
    ├── accepted
    ├── reason
    └── fallback
```

**Eu armazenaria os logits/raw scores**, não somente confidence.

Isso é bastante importante. Imagine que daqui a três meses você tenha muito mais ground truth e crie:

```text
calibrator v1 → ruim
calibrator v2 → muito melhor
```

Se guardou apenas:

```text
confidence = .93
```

perdeu informação.

Se guardou:

```text
raw_logits = [...]
```

você pode pegar milhões de decisões antigas e executar apenas:

```text
stored raw logits
      ↓
new calibrator
      ↓
new confidence
      ↓
new policy
```

sem rodar Laya novamente.

---

E há uma segunda razão para guardar isso no projeto de benchmark: você consegue simular **cascades retrospectivamente**.

Depois de 20 runs, poderia perguntar:

> Se eu tivesse usado Laya com threshold `.94` e Jev como fallback, qual teria sido minha accuracy, latência, custo e percentual de chamadas ao Jev?

Como os raw outputs estão armazenados, isso vira basicamente uma consulta/simulação, não um novo benchmark.

Esse ponto reforça uma separação que eu colocaria desde o início na arquitetura que estamos desenhando:

**Inference → Calibration → Decision Policy → Routing/Fallback.**

São quatro coisas diferentes e deveriam ser versionáveis independentemente.
