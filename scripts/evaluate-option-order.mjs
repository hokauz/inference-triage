#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf(`--${name}`); return index < 0 ? fallback : args[index + 1]; };
const runSpec = option("runs", "canonical=artifacts/v0-laya-local/order-canonical,reverse=artifacts/v0-laya-local/order-reverse,rotate=artifacts/v0-laya-local/order-rotate,seed-17=artifacts/v0-laya-local/order-seed-17,seed-29=artifacts/v0-laya-local/order-seed-29");
const output = resolve(root, option("output", "artifacts/v0-laya-local/option-order-report.json"));
const runs = Object.fromEntries(runSpec.split(",").map((entry) => { const [name, path] = entry.split("="); return [name, resolve(root, path)]; }));
const read = (directory) => {
  const run = JSON.parse(readFileSync(resolve(directory, "benchmark_run.json"), "utf8"));
  const db = new DatabaseSync(resolve(directory, "benchmark.sqlite"), { readOnly: true });
  const rows = db.prepare("SELECT sample_id, category, product, model_output_json FROM sample_execution WHERE run_id = ?").all(run.id).map((row) => ({ ...row, output: JSON.parse(row.model_output_json) }));
  db.close();
  return new Map(rows.map((row) => [row.sample_id, row]));
};
const loaded = Object.fromEntries(Object.entries(runs).map(([name, directory]) => [name, read(directory)]));
const canonical = loaded.canonical;
if (!canonical) throw new Error("runs must include canonical=<dir>");
const names = Object.keys(loaded).filter((name) => name !== "canonical");
const classes = ["category", "product"];
const comparisons = Object.fromEntries(names.map((name) => {
  let changed = 0; let maxProbabilityDelta = 0; const changedByClass = {};
  for (const [sampleId, base] of canonical) {
    const variant = loaded[name].get(sampleId);
    if (!variant) throw new Error(`missing sample ${sampleId} in ${name}`);
    for (const field of classes) {
      if (base[field] !== variant[field]) { changed += 1; changedByClass[`${field}:${base[field]}->${variant[field]}`] = (changedByClass[`${field}:${base[field]}->${variant[field]}`] ?? 0) + 1; }
      const probabilities = base.output?.[`${field}Probabilities`] ?? {};
      const variantProbabilities = variant.output?.[`${field}Probabilities`] ?? {};
      for (const key of new Set([...Object.keys(probabilities), ...Object.keys(variantProbabilities)])) maxProbabilityDelta = Math.max(maxProbabilityDelta, Math.abs((probabilities[key] ?? 0) - (variantProbabilities[key] ?? 0)));
    }
  }
  return [name, { samples: canonical.size, changedDecisions: changed, changedByClass, maxProbabilityDelta }];
}));
const report = { reportType: "finguard_option_order_report", status: "ai_draft_exploratory_only", canonical: runs.canonical, variants: runs, comparisons, promotionBlocked: Object.values(comparisons).some((value) => value.changedDecisions > 0) };
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, promotionBlocked: report.promotionBlocked, comparisons }, null, 2));
