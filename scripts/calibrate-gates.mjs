#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { fitTemperature, temperatureScale, brierScore, ece, riskCoverage } from "../runtimes/typescript/dist/src/core/calibration.js";
import { loadTaxonomy } from "../runtimes/typescript/dist/src/core/assets.js";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf(`--${name}`); return index < 0 ? fallback : args[index + 1]; };
const runDir = resolve(root, option("run", "artifacts/v0-laya-local/multi-v1-source-rerun"));
const output = resolve(root, option("output", `${runDir}/calibration.json`));
const decisionsOutput = resolve(root, option("decisions-output", `${runDir}/confidence_decisions.jsonl`));
const digest = (value) => createHash("sha256").update(value).digest("hex");

function csv(text) {
  const rows = []; let row = []; let field = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) { if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; } else if (character === '"') quoted = false; else field += character; }
    else if (character === '"') quoted = true;
    else if (character === ',') { row.push(field); field = ""; }
    else if (character === '\n') { row.push(field.replace(/\r$/, "")); if (row.some(Boolean)) rows.push(row); row = []; field = ""; }
    else field += character;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const headers = rows.shift().map((value) => value.replace(/^\uFEFF/, "").trim());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}
const labels = csv(readFileSync(resolve(root, "datasets/gold/finguard/labels-ai-draft-v2.csv"), "utf8"));
const byClass = new Map();
for (const label of labels) { const group = byClass.get(label.category) ?? []; group.push(label); byClass.set(label.category, group); }
const splitById = new Map();
for (const group of byClass.values()) {
  group.sort((a, b) => digest(a.sample_id).localeCompare(digest(b.sample_id)));
  group.forEach((label, index) => splitById.set(label.sample_id, index < Math.floor(group.length * 0.6) ? "development" : index < Math.floor(group.length * 0.8) ? "validation" : "test"));
}
const run = JSON.parse(readFileSync(resolve(runDir, "benchmark_run.json"), "utf8"));
const db = new DatabaseSync(resolve(runDir, "benchmark.sqlite"), { readOnly: true });
const outputs = new Map(db.prepare("SELECT sample_id, model_output_json FROM sample_execution WHERE run_id = ?").all(run.id).map((row) => [row.sample_id, JSON.parse(row.model_output_json)]));
db.close();
const taxonomy = loadTaxonomy(resolve(root, "assets/taxonomies/finguard/taxonomy-v1.yaml"));
const fieldRows = (field, gold) => labels.filter((label) => splitById.get(label.sample_id) !== "test").map((label) => {
  const probabilities = outputs.get(label.sample_id)?.[`${field}Probabilities`];
  return probabilities ? { split: splitById.get(label.sample_id), gold: gold(label), probabilities } : null;
}).filter(Boolean);
const fields = {
  category: { rows: fieldRows("category", (label) => label.category), classes: taxonomy.categories },
  product: { rows: fieldRows("product", (label) => label.product), classes: taxonomy.products },
  urgency: { rows: fieldRows("urgency", (label) => String(taxonomy.urgency.indexOf(label.urgency))), classes: taxonomy.urgency.map((_, index) => String(index)) },
};
const fit = {};
for (const [field, data] of Object.entries(fields)) {
  const development = data.rows.filter((row) => row.split === "development");
  const temperature = fitTemperature(development);
  const metrics = (rows) => {
    const calibrated = rows.map((row) => ({ gold: row.gold, probabilities: temperatureScale(row.probabilities, temperature) }));
    return { count: rows.length, brier: brierScore(calibrated, data.classes), ece10: ece(calibrated), riskCoverage: riskCoverage(calibrated) };
  };
  fit[field] = { temperature, development: metrics(development), validation: metrics(data.rows.filter((row) => row.split === "validation")) };
}
const calibrator = {
  version: "finguard-calibration-v1",
  method: "temperature_scaling",
  status: "experimental",
  fit_split: "development",
  selection_split: "validation",
  reference_type: "ai_draft_non_gold",
  dataset_hash: run.dataset_hash,
  model_hash: run.model_hash,
  prompt_hash: run.prompt_hash,
  run_id: run.id,
  temperatures: Object.fromEntries(Object.entries(fit).map(([field, value]) => [field, value.temperature])),
  fields: fit,
};
writeFileSync(output, `${JSON.stringify(calibrator, null, 2)}\n`);
const decisionRows = labels.map((label) => {
  const output = outputs.get(label.sample_id) ?? {};
  const calibrated = Object.fromEntries(["category", "product", "urgency"].map((field) => {
    const probabilities = output[`${field}Probabilities`] ?? {};
    return [field, { rawProbabilities: probabilities, rawScores: output[`${field}RawScores`] ?? Object.fromEntries(Object.entries(probabilities).map(([key, value]) => [key, Math.log(Math.max(value, 1e-8))])), rawScoreKind: output[`${field}RawScoreKind`] ?? "log_probability", calibratedProbabilities: temperatureScale(probabilities, calibrator.temperatures[field]), chosen: output[field] ?? null }];
  }));
  return JSON.stringify({ sampleId: label.sample_id, calibratorVersion: calibrator.version, confidencePolicy: "experimental", ...calibrated });
}).join("\n") + "\n";
writeFileSync(decisionsOutput, decisionRows);
console.log(JSON.stringify({ output, temperatures: calibrator.temperatures, status: calibrator.status }, null, 2));
