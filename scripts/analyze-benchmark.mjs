#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);

function option(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

const labelsPath = resolve(root, option("labels", "datasets/gold/finguard/labels-ai-draft-v2.csv"));
const benchmarkPath = resolve(root, option("benchmark", "artifacts/v0-laya/full/sample_executions.jsonl"));
const outputPath = resolve(root, option("output", "artifacts/v0-laya/full/benchmark_analysis.json"));
const sqlitePath = resolve(root, option("sqlite", `${benchmarkPath.replace(/\/sample_executions\.jsonl$/, "")}/benchmark.sqlite`));

function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < content.length; i += 1) {
    const c = content[i];
    if (quoted) {
      if (c === '"' && content[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ""; }
    else if (c === '\n') { row.push(field.replace(/\r$/, "")); if (row.some(Boolean)) rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (quoted) throw new Error("labels CSV contains an unterminated quoted field");
  if (field || row.length) { row.push(field.replace(/\r$/, "")); if (row.some(Boolean)) rows.push(row); }
  const headers = rows.shift()?.map((value) => value.replace(/^\uFEFF/, "").trim()) ?? [];
  return rows.map((values) => Object.fromEntries(headers.map((header, i) => [header, (values[i] ?? "").trim()])));
}

function bool(value) { return value === true || value === "true" || value === "1"; }
function distribution(rows, key) {
  const counts = {};
  for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}
function confusion(labels, predictions, field) {
  const matrix = {};
  for (const label of labels) {
    const expected = label[field];
    const actual = predictions.get(label.sample_id)?.[field];
    if (actual === undefined) continue;
    matrix[expected] ??= {};
    matrix[expected][actual] = (matrix[expected][actual] ?? 0) + 1;
  }
  return matrix;
}
function agreement(labels, predictions, field, normalize = (value) => value) {
  let compared = 0; let matches = 0;
  for (const label of labels) {
    const prediction = predictions.get(label.sample_id);
    if (!prediction || label[field] === "") continue;
    compared += 1;
    if (normalize(label[field]) === normalize(prediction[field])) matches += 1;
  }
  return { compared, matches, rate: compared ? matches / compared : null };
}
function predictionField(field) {
  return field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
function quantile(values, q) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * q)];
}
function classMetrics(labels, predictions, field) {
  const expected = new Map();
  const actual = new Map();
  const pairs = [];
  for (const label of labels) {
    const prediction = predictions.get(label.sample_id);
    if (!prediction || label[field] === "") continue;
    const predictionValue = prediction[predictionField(field)] ?? prediction[field];
    if (predictionValue === undefined) continue;
    pairs.push([label[field], String(predictionValue)]);
    expected.set(label[field], (expected.get(label[field]) ?? 0) + 1);
    actual.set(String(predictionValue), (actual.get(String(predictionValue)) ?? 0) + 1);
  }
  const classes = [...new Set(pairs.flat())].sort();
  const perClass = {};
  let macroF1 = 0;
  for (const value of classes) {
    const tp = pairs.filter(([gold, prediction]) => gold === value && prediction === value).length;
    const support = expected.get(value) ?? 0;
    const predicted = actual.get(value) ?? 0;
    const precision = predicted ? tp / predicted : 0;
    const recall = support ? tp / support : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    perClass[value] = { support, predicted, true_positive: tp, precision, recall, f1 };
    macroF1 += f1;
  }
  return { classes: perClass, macro_f1: classes.length ? macroF1 / classes.length : null };
}

try {
  const labels = parseCsv(readFileSync(labelsPath, "utf8"));
  const predictions = readFileSync(benchmarkPath, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const byId = new Map(predictions.map((row) => [row.sampleId, row]));
  const labelIds = new Set(labels.map((row) => row.sample_id));
  const predictionIds = new Set(predictions.map((row) => row.sampleId));
  const missingPredictions = labels.filter((row) => !predictionIds.has(row.sample_id)).map((row) => row.sample_id);
  const extraPredictions = predictions.filter((row) => !labelIds.has(row.sampleId)).map((row) => row.sampleId);
  const db = new DatabaseSync(sqlitePath, { readOnly: true });
  const restrictedHashes = new Map(db.prepare("SELECT sample_id, text_hash FROM sample_restricted").all().map((row) => [row.sample_id, row.text_hash]));
  db.close();
  const hashMismatches = labels.filter((row) => restrictedHashes.has(row.sample_id) && row.source_text_hash !== restrictedHashes.get(row.sample_id)).map((row) => row.sample_id);
  const fields = ["category", "product", "urgency", "risk", "priority", "generation_disposition"];
  const agreements = Object.fromEntries(fields.map((field) => [field, agreement(labels, new Map(predictions.map((row) => [row.sampleId, { [field]: row[predictionField(field)] ?? row[field] }])), field, field === "priority" ? Number : (value) => value)]));
  const threatFields = ["pii_present", "prompt_injection", "exfiltration_request", "unauthorized_data_access", "external_exfiltration"];
  const threatAgreements = Object.fromEntries(threatFields.map((field) => {
    let compared = 0; let matches = 0;
    for (const label of labels) {
      const prediction = byId.get(label.sample_id);
      if (!prediction) continue;
      compared += 1;
      if (bool(label[field]) === Boolean(prediction.threats?.[predictionField(field)])) matches += 1;
    }
    return [field, { compared, matches, rate: compared ? matches / compared : null }];
  }));
  const latencies = predictions.map((row) => Number(row.decisionMs)).filter(Number.isFinite);
  const report = {
    report_type: "benchmark_comparison",
    reference_type: "ai_draft_non_gold",
    warning: "labels-ai-draft-v2 was derived from an AI-assisted draft, has canonical source hashes, and remains pending human review; agreement is not accuracy.",
    labels_file: labelsPath.replace(`${root}/`, ""),
    benchmark_file: benchmarkPath.replace(`${root}/`, ""),
    label_status: distribution(labels, "review_status"),
    coverage: { labels: labels.length, predictions: predictions.length, matched: labels.length - missingPredictions.length, missingPredictions, extraPredictions, hashChecked: restrictedHashes.size, hashMismatches },
    label_quantities: Object.fromEntries(fields.map((field) => [field, distribution(labels, field)])),
    benchmark_quantities: Object.fromEntries(fields.map((field) => [field, distribution(predictions.map((row) => ({ value: row[predictionField(field)] ?? row[field] })), "value")])),
    agreements,
    class_metrics: Object.fromEntries(["category", "product", "urgency", "risk"].map((field) => [field, classMetrics(labels, byId, field)])),
    threat_agreements: threatAgreements,
    confusion: Object.fromEntries(["category", "product", "urgency", "risk"].map((field) => [field, confusion(labels, byId, field)])),
    benchmark_performance: {
      count: latencies.length,
      average_decision_ms: latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : null,
      p50_decision_ms: quantile(latencies, 0.5),
      p95_decision_ms: quantile(latencies, 0.95),
      p99_decision_ms: quantile(latencies, 0.99),
      max_decision_ms: latencies.length ? Math.max(...latencies) : null,
      routing: distribution(predictions, "generationDisposition"),
    },
  };
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: "completed", output: outputPath, matched: report.coverage.matched, labelCount: labels.length, predictionCount: predictions.length }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
