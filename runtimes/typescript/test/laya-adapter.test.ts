import assert from "node:assert/strict";
import test from "node:test";

import { mapChoice, mapScore, mapTaxonomyChoice } from "../src/adapters/laya.js";

test("maps Laya choice answers and uses the maximum probability", () => {
  const result = mapChoice({ choice: "Fraude/Segurança", probabilities: { "Fraude/Segurança": 0.91, Outros: 0.09 } }, "Outros");
  assert.deepEqual(result, { value: "Fraude/Segurança", confidence: 0.91 });
});

test("maps Laya ordinal scores to the active urgency taxonomy", () => {
  const result = mapScore({ score: 2.2, probabilities: { baixa: 0.01, media: 0.08, alta: 0.86, critica: 0.05 } }, ["Baixa", "Média", "Alta", "Crítica"]);
  assert.equal(result.value, "Alta");
  assert.equal(result.confidence, 0.86);
});

test("uses a safe fallback for malformed Laya answers", () => {
  assert.deepEqual(mapChoice({}, "Não Identificado"), { value: "Não Identificado", confidence: 0.5 });
  assert.equal(mapScore({}, ["Baixa", "Média", "Alta", "Crítica"]).value, "Baixa");
});

test("normalizes taxonomy choices and conservatively falls back on low confidence", () => {
  const taxonomy = ["Cartão de Crédito", "Conta Corrente", "Não Identificado"];
  assert.deepEqual(
    mapTaxonomyChoice({ choice: "Conta Corrente", probabilities: { "Conta Corrente": 0.81 } }, taxonomy, "Não Identificado", 0.6),
    { value: "Conta Corrente", confidence: 0.81 },
  );
  assert.deepEqual(
    mapTaxonomyChoice({ choice: "Produto inventado", probabilities: { "Produto inventado": 0.99 } }, taxonomy, "Não Identificado", 0.6),
    { value: "Não Identificado", confidence: 0.99 },
  );
  assert.deepEqual(
    mapTaxonomyChoice({ choice: "Cartão de Crédito", probabilities: { "Cartão de Crédito": 0.42 } }, taxonomy, "Não Identificado", 0.6),
    { value: "Não Identificado", confidence: 0.42 },
  );
});
