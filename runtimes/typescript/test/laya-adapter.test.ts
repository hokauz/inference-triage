import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

import { Tokenizer } from "@huggingface/tokenizers";

import { mapChoice, mapScore, mapTaxonomyChoice, rawScores, resolveHierarchicalCategory, selectProduct, validateQuestionBudget } from "../src/adapters/laya.js";
import { loadDecisionPrompt } from "../src/core/decision-prompt.js";
import { reorderDecisionPrompt } from "../src/core/decision-prompt.js";
import { brierScore, ece, fitTemperature, riskCoverage, temperatureScale } from "../src/core/calibration.js";
import { loadFinGuardPack, loadTaxonomy, promptHash } from "../src/core/assets.js";

test("confidence is assigned to the returned choice rather than the largest option", () => {
  const result = mapChoice({ choice: "Fraude/Segurança", probabilities: { "Fraude/Segurança": 0.35, Outros: 0.65 } }, "Outros");
  assert.equal(result.confidence, 0.35);
  assert.equal(result.probabilities.Outros, 0.65);
});

test("invalid answers have zero confidence and taxonomy fallback", () => {
  assert.deepEqual(mapChoice({}, "Outros"), { value: "Outros", confidence: 0, probabilities: {} });
  assert.equal(mapChoice({ probabilities: { Outros: 0.9 } }, "Outros").confidence, 0);
  const result = mapTaxonomyChoice({ choice: "Inventado", probabilities: { Inventado: 0.99, "Não Identificado": 0.01 } }, ["Conta Corrente", "Não Identificado"], "Não Identificado", 0.6);
  assert.equal(result.value, "Não Identificado");
  assert.equal(result.confidence, 0);
});

test("score threshold moves only the medium/high boundary", () => {
  const values = ["Baixa", "Média", "Alta", "Crítica"];
  const answer = { score: 1.4, probabilities: { "0": 0.01, "1": 0.4, "2": 0.5, "3": 0.09 } };
  assert.equal(mapScore(answer, values, 1.5).value, "Média");
  assert.equal(mapScore(answer, values, 1.3).value, "Alta");
  assert.equal(mapScore(answer, values, 1.3).confidence, 0.5);
  assert.equal(mapScore({}, values).confidence, 0);
  assert.equal(mapScore({ probabilities: { "0": 0.9 } }, values).confidence, 0);
});

test("hierarchical choice only asks the fine question for Demais", async () => {
  const categories = ["Fraude/Segurança", "Cancelamento", "Cobrança Indevida", "Outros"];
  let fineCalls = 0;
  const fine = async () => { fineCalls += 1; return { choice: "Cobrança Indevida", probabilities: { "Cobrança Indevida": 0.8, Outros: 0.2 } }; };
  assert.equal((await resolveHierarchicalCategory({ choice: "Fraude/Segurança", probabilities: { "Fraude/Segurança": 0.7 } }, fine, categories)).category.value, "Fraude/Segurança");
  assert.equal(fineCalls, 0);
  assert.equal((await resolveHierarchicalCategory({ choice: "Demais", probabilities: { Demais: 0.8 } }, fine, categories)).category.value, "Cobrança Indevida");
  assert.equal(fineCalls, 1);
});

test("source product policy uses known metadata and reports the selected class probability", () => {
  const model = { value: "Não Identificado", confidence: 0.8, probabilities: { "Não Identificado": 0.8, Seguros: 0.2 } };
  const products = ["Seguros", "Não Identificado"];
  assert.deepEqual(selectProduct(model, "Seguros", products, "source_if_known"), { ...model, value: "Seguros", confidence: 0.2 });
  assert.equal(selectProduct(model, "Inventado", products, "source_if_known").value, "Não Identificado");
  assert.equal(selectProduct(model, "Seguros", products, "model").value, "Não Identificado");
});

test("raw scores are stable log scores and temperature scaling preserves the winner", () => {
  const probabilities = { A: 0.8, B: 0.2 };
  assert.ok(rawScores(probabilities).A > rawScores(probabilities).B);
  const scaled = temperatureScale(probabilities, 4.25);
  assert.equal(Object.keys(scaled).reduce((a, b) => scaled[a] > scaled[b] ? a : b), "A");
  assert.ok(Math.abs(Object.values(scaled).reduce((sum, value) => sum + value, 0) - 1) < 1e-9);
});

test("calibration metrics and risk coverage are deterministic", () => {
  const rows = [{ gold: "A", probabilities: { A: 0.8, B: 0.2 } }, { gold: "B", probabilities: { A: 0.4, B: 0.6 } }];
  assert.equal(fitTemperature(rows), 0.5);
  assert.ok(brierScore(rows, ["A", "B"]) >= 0);
  assert.ok(ece(rows) >= 0);
  assert.equal(riskCoverage(rows, [0.5])[0].accepted, 2);
});

test("versioned prompts preserve taxonomy and branch coverage", () => {
  const root = resolve(import.meta.dirname, "../../../..");
  const taxonomy = loadTaxonomy(resolve(root, "assets/taxonomies/finguard/taxonomy-v1.yaml"));
  for (const name of ["decision-v1.json", "decision-v2.json", "decision-v3-contrastive.json", "decision-v2-hierarchical.json"]) {
    const prompt = loadDecisionPrompt(resolve(root, "assets/prompts/finguard", name), taxonomy);
    assert.ok(prompt.version);
    if (prompt.mode === "flat") assert.deepEqual(Object.keys(prompt.category!.criteria), taxonomy.categories);
    else {
      assert.deepEqual(Object.keys(prompt.coarse!.criteria), ["Fraude/Segurança", "Cancelamento", "Demais"]);
      assert.deepEqual(Object.keys(prompt.fine!.criteria), ["Cobrança Indevida", "Atendimento", "Produto/Serviço", "Outros"]);
    }
  }
});

test("option ordering changes insertion order without changing taxonomy", () => {
  const root = resolve(import.meta.dirname, "../../../..");
  const taxonomy = loadTaxonomy(resolve(root, "assets/taxonomies/finguard/taxonomy-v1.yaml"));
  const prompt = loadDecisionPrompt(resolve(root, "assets/prompts/finguard/decision-v1.json"), taxonomy);
  const reversed = reorderDecisionPrompt(prompt, "reverse");
  assert.deepEqual(Object.keys(reversed.category!.criteria), [...taxonomy.categories].reverse());
  assert.deepEqual(Object.keys(prompt.category!.criteria), taxonomy.categories);
});

test("the pack hashes the decision prompt the adapter executes", () => {
  const root = resolve(import.meta.dirname, "../../../..");
  const pack = loadFinGuardPack(root, resolve(root, "assets/packs/finguard/pack.yaml"));
  assert.equal(pack.decisionPromptPath, pack.promptPaths[0]);
  const taxonomy = loadTaxonomy(pack.taxonomyPath);
  assert.equal(loadDecisionPrompt(pack.decisionPromptPath, taxonomy).version, "finguard-decision-v1");
  const original = promptHash(pack.promptPaths);
  const candidate = promptHash([resolve(root, "assets/prompts/finguard/decision-v2.json"), ...pack.promptPaths.slice(1)]);
  assert.notEqual(original, candidate);
});

test("rejects a question that would truncate its instructions or options", () => {
  const encode = (text: string) => Array.from(text).map((_, index) => index);
  assert.throws(() => validateQuestionBudget(encode, 20, "category", { type: "choice", instructions: "long instructions", criteria: { A: "alpha", B: "beta" } }), /exceeds head_max_len/);
  assert.doesNotThrow(() => validateQuestionBudget(encode, 40, "category", { type: "choice", instructions: "pick", criteria: { A: "one", B: "two" } }));
});

test("all question variants fit both checkpoint token budgets without truncation", () => {
  const root = resolve(import.meta.dirname, "../../../..");
  const taxonomy = loadTaxonomy(resolve(root, "assets/taxonomies/finguard/taxonomy-v1.yaml"));
  for (const variant of ["multilingual", "multilingual-onnx"]) {
    const base = resolve(root, "models/laya", variant);
    const tokenizer = new Tokenizer(JSON.parse(readFileSync(resolve(base, "tokenizer/tokenizer.json"), "utf8")), JSON.parse(readFileSync(resolve(base, "tokenizer/tokenizer_config.json"), "utf8")));
    const budget = JSON.parse(readFileSync(resolve(base, "laya_config.json"), "utf8")).head_max_len as number;
    const encode = (value: string) => tokenizer.encode(value, { add_special_tokens: false }).ids;
    for (const name of ["decision-v1.json", "decision-v2.json", "decision-v3-contrastive.json", "decision-v2-hierarchical.json"]) {
      const prompt = loadDecisionPrompt(resolve(root, "assets/prompts/finguard", name), taxonomy);
      if (prompt.mode === "flat") validateQuestionBudget(encode, budget, `${variant}/${name}/category`, { type: "choice", ...prompt.category! });
      else {
        validateQuestionBudget(encode, budget, `${variant}/${name}/coarse`, { type: "choice", ...prompt.coarse! });
        validateQuestionBudget(encode, budget, `${variant}/${name}/fine`, { type: "choice", ...prompt.fine! });
      }
      validateQuestionBudget(encode, budget, `${variant}/${name}/product`, { type: "choice", instructions: prompt.product.instructions, criteria: Object.fromEntries(taxonomy.products.map((value) => [value, value])) });
      validateQuestionBudget(encode, budget, `${variant}/${name}/urgency`, { type: "score", instructions: prompt.urgency.instructions, criteria: taxonomy.urgency });
    }
  }
});
