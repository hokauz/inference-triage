#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf(`--${name}`); return index < 0 ? fallback : args[index + 1]; };
const orders = ["canonical", "reverse", "rotate", "seed-17", "seed-29"];
const outputRoot = resolve(root, option("output-root", "artifacts/v0-laya-local/option-order"));
const common = [
  "runtimes/typescript/dist/src/commands/v0.js", "run",
  "--input", resolve(root, option("input", "datasets/source/finguard/dataset_finguard_desafio_3.csv")),
  "--pack", resolve(root, option("pack", "assets/packs/finguard/pack.yaml")),
  "--mode", "laya",
  "--model-dir", resolve(root, option("model-dir", "models/laya/multilingual-onnx")),
  "--decision-prompt", resolve(root, option("decision-prompt", "assets/prompts/finguard/decision-v1.json")),
  "--product-policy", option("product-policy", "source_if_known"),
];
mkdirSync(outputRoot, { recursive: true });
for (const order of orders) {
  const directory = resolve(outputRoot, order);
  execFileSync(process.execPath, [...common, "--output-dir", directory, "--option-order", order], { cwd: root, stdio: "inherit", env: process.env });
}
console.log(JSON.stringify({ outputRoot, orders }, null, 2));
