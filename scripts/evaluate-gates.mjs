#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { applyDeterministicRules } from "../runtimes/typescript/dist/src/core/rules.js";
import { loadTaxonomy } from "../runtimes/typescript/dist/src/core/assets.js";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
function option(name, fallback) { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; }
const manifest = JSON.parse(readFileSync(resolve(root, "checks/gates/finguard-v0.json"), "utf8"));
const runDir = resolve(root, option("run", "artifacts/v0-laya-local/full"));
const baselineDir = resolve(root, option("baseline", "artifacts/v0-laya-local/full"));
const phase = option("phase", "validation");
const confidencePolicy = option("confidence-policy", "none");
const calibratorPath = option("calibrator", null);
const optionOrderReportPath = option("option-order-report", null);
if (!["development", "validation", "test", "full"].includes(phase)) throw new Error(`invalid phase: ${phase}`);
if (!["none", "experimental"].includes(confidencePolicy)) throw new Error("invalid confidence policy");
if (["test", "full"].includes(phase) && !args.includes("--unlock-test")) throw new Error("test/full evaluation requires --unlock-test after candidate selection");

function csv(text) {
  const rows = []; let row = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) { if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (ch === '"') quoted = false; else field += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ""; }
    else if (ch === '\n') { row.push(field.replace(/\r$/, "")); if (row.some(Boolean)) rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (quoted) throw new Error("unterminated CSV field");
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const headers = rows.shift().map((value) => value.replace(/^\uFEFF/, "").trim());
  return rows.map((values) => Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ""])));
}
const labels = csv(readFileSync(resolve(root, manifest.labels), "utf8"));
if (createHash("sha256").update(readFileSync(resolve(root, manifest.labels))).digest("hex") !== manifest.labels_sha256) throw new Error("reference labels hash differs from frozen manifest");
const labelById = new Map(labels.map((row) => [row.sample_id, row]));
if (labels.length !== 500 || labelById.size !== 500) throw new Error("reference must contain 500 unique labels");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const byClass = new Map();
for (const row of labels) { const group = byClass.get(row.category) ?? []; group.push(row); byClass.set(row.category, group); }
const splitById = new Map();
for (const group of byClass.values()) {
  group.sort((a, b) => digest(a.sample_id).localeCompare(digest(b.sample_id)));
  const devEnd = Math.floor(group.length * manifest.split.development);
  const valEnd = Math.floor(group.length * (manifest.split.development + manifest.split.validation));
  group.forEach((row, i) => splitById.set(row.sample_id, i < devEnd ? "development" : i < valEnd ? "validation" : "test"));
}

function readRun(directory, withModelOutput) {
  const run = JSON.parse(readFileSync(resolve(directory, "benchmark_run.json"), "utf8"));
  const rows = readFileSync(resolve(directory, "sample_executions.jsonl"), "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const byId = new Map(rows.map((row) => [row.sampleId, row]));
  if (run.status !== "completed" || rows.length !== 500 || byId.size !== 500) throw new Error(`incomplete run or duplicate IDs: ${directory}`);
  const db = new DatabaseSync(resolve(directory, "benchmark.sqlite"), { readOnly: true });
  const config = JSON.parse(db.prepare("SELECT pipeline_config_json FROM benchmark_run WHERE id = ?").get(run.id)?.pipeline_config_json ?? "{}");
  const restricted = db.prepare("SELECT sample_id, text_hash FROM sample_restricted WHERE run_id = ?").all(run.id);
  const hashes = new Map(restricted.map((row) => [row.sample_id, row.text_hash]));
  const modelOutput = withModelOutput ? new Map(db.prepare("SELECT sample_id, model_output_json FROM sample_execution WHERE run_id = ?").all(run.id).map((row) => [row.sample_id, row.model_output_json ? JSON.parse(row.model_output_json) : null])) : new Map();
  const source = withModelOutput ? new Map(db.prepare("SELECT sample_id, occurred_at, channel, source_product, source_status, raw_text, text_hash FROM sample_restricted WHERE run_id = ?").all(run.id).map((row) => [row.sample_id, row])) : new Map();
  db.close();
  const missing = labels.filter((row) => !byId.has(row.sample_id)).map((row) => row.sample_id);
  const extra = rows.filter((row) => !labelById.has(row.sampleId)).map((row) => row.sampleId);
  const mismatches = labels.filter((row) => row.source_text_hash !== hashes.get(row.sample_id)).map((row) => row.sample_id);
  if (missing.length || extra.length || mismatches.length || hashes.size !== 500) throw new Error(`coverage/hash failure: missing=${missing.length} extra=${extra.length} mismatches=${mismatches.length}`);
  if (run.dataset_hash !== manifest.baseline.dataset_hash || run.taxonomy_hash !== manifest.baseline.taxonomy_hash || run.policy_hash !== manifest.baseline.policy_hash) throw new Error("dataset, taxonomy or policy hash differs from baseline");
  if (!manifest.candidate_model_hashes.includes(run.model_hash)) throw new Error(`unrecognized model bundle hash: ${run.model_hash}`);
  if (withModelOutput) {
    const promptDir = resolve(root, "assets/prompts/finguard");
    const decisionPrompt = config.decisionPromptAsset
      ? resolve(root, config.decisionPromptAsset)
      : readdirSync(promptDir).filter((name) => name.endsWith(".json")).map((name) => resolve(promptDir, name)).find((path) => JSON.parse(readFileSync(path, "utf8")).version === config.decisionPromptVersion);
    if (!decisionPrompt) throw new Error("cannot resolve effective decision prompt for run");
    const promptBytes = [decisionPrompt, resolve(promptDir, "risk-review-v1.md"), resolve(promptDir, "summary-v1.md")].map((path) => readFileSync(path, "utf8")).join("\n---\n");
    if (digest(promptBytes) !== run.prompt_hash) throw new Error("run prompt hash differs from effective prompt assets");
  }
  return { run, rows, byId, modelOutput, source };
}
const candidate = readRun(runDir, true);
const baseline = readRun(baselineDir, false);
if (baseline.run.id !== manifest.baseline.run_id) throw new Error("baseline run ID differs from frozen manifest");
let calibrator = null;
if (calibratorPath) {
  calibrator = JSON.parse(readFileSync(resolve(root, calibratorPath), "utf8"));
  for (const [key, expected] of [["dataset_hash", candidate.run.dataset_hash], ["model_hash", candidate.run.model_hash], ["prompt_hash", candidate.run.prompt_hash]]) {
    if (calibrator[key] !== expected) throw new Error(`calibrator ${key} does not match candidate run`);
  }
}
if (confidencePolicy === "experimental" && !calibrator) throw new Error("experimental confidence policy requires --calibrator");

const fields = ["category", "product", "urgency", "risk", "priority", "generationDisposition"];
const labelField = { generationDisposition: "generation_disposition" };
const threatFields = { piiPresent: "pii_present", promptInjection: "prompt_injection", exfiltrationRequest: "exfiltration_request", unauthorizedDataAccess: "unauthorized_data_access", externalExfiltration: "external_exfiltration" };
const selected = labels.filter((row) => phase === "full" || splitById.get(row.sample_id) === phase);
function metrics(run) {
  const matches = Object.fromEntries(fields.map((field) => [field, selected.filter((label) => String(run.byId.get(label.sample_id)[field]) === label[labelField[field] ?? field]).length]));
  const threatMatches = Object.fromEntries(Object.entries(threatFields).map(([field, label]) => [field, selected.filter((row) => Boolean(run.byId.get(row.sample_id).threats[field]) === (row[label] === "true")).length]));
  const classes = [...byClass.keys()].sort();
  const confusion = Object.fromEntries(classes.map((actual) => [actual, Object.fromEntries(classes.map((predicted) => [predicted, selected.filter((row) => row.category === actual && run.byId.get(row.sample_id).category === predicted).length]))]));
  const classF1 = Object.fromEntries(classes.map((value) => {
    const tp = confusion[value][value];
    const support = selected.filter((row) => row.category === value).length;
    const predicted = selected.filter((row) => run.byId.get(row.sample_id).category === value).length;
    return [value, tp ? 2 * tp / (support + predicted) : 0];
  }));
  const latencies = selected.map((row) => run.byId.get(row.sample_id).decisionMs).sort((a, b) => a - b);
  return { count: selected.length, matches, agreement: Object.fromEntries(fields.map((field) => [field, matches[field] / selected.length])), threatMatches, categoryMacroF1: Object.values(classF1).reduce((a, b) => a + b, 0) / classes.length, categoryClassF1: classF1, confusion, p95DecisionMs: latencies[Math.floor((latencies.length - 1) * 0.95)] };
}
const candidateMetrics = metrics(candidate);
const baselineMetrics = metrics(baseline);
const taxonomy = loadTaxonomy(resolve(root, "assets/taxonomies/finguard/taxonomy-v1.yaml"));
const urgencyGrid = Array.from({ length: 17 }, (_, index) => Number((1 + index * 0.05).toFixed(2))).map((boundary) => {
  const comparable = selected.filter((label) => Number.isFinite(candidate.modelOutput.get(label.sample_id)?.urgencyScore));
  if (comparable.length !== selected.length) return { boundary, status: "unavailable" };
  const matches = { urgency: 0, risk: 0, priority: 0, generationDisposition: 0 };
  for (const label of comparable) {
    const source = candidate.source.get(label.sample_id);
    const output = candidate.modelOutput.get(label.sample_id);
    const score = output.urgencyScore;
    const index = score >= 2.5 ? 3 : score >= boundary ? 2 : score >= 0.5 ? 1 : 0;
    const decision = applyDeterministicRules({ id: label.sample_id, occurredAt: source.occurred_at, channel: source.channel, sourceProduct: source.source_product, sourceStatus: source.source_status, rawText: source.raw_text, textHash: source.text_hash }, taxonomy, {
      category: output.category,
      product: output.product,
      urgency: taxonomy.urgency[index],
      confidence: output.confidence,
    });
    matches.urgency += Number(decision.urgency === label.urgency);
    matches.risk += Number(decision.risk === label.risk);
    matches.priority += Number(String(decision.routing.priority) === label.priority);
    matches.generationDisposition += Number(decision.routing.generationDisposition === label.generation_disposition);
  }
  return { boundary, status: "available", matches, agreement: Object.fromEntries(Object.entries(matches).map(([field, count]) => [field, count / selected.length])) };
});
const priorityDiagnostics = selected.filter((label) => {
  const actual = candidate.byId.get(label.sample_id);
  const baselineActual = baseline.byId.get(label.sample_id);
  return phase === "full" && (String(actual.priority) !== label.priority || String(baselineActual.priority) !== label.priority);
}).map((label) => {
  const output = candidate.modelOutput.get(label.sample_id) ?? {};
  const source = candidate.source.get(label.sample_id);
  return {
    sampleId: label.sample_id,
    expectedPriority: Number(label.priority),
    candidatePriority: candidate.byId.get(label.sample_id).priority,
    baselinePriority: baseline.byId.get(label.sample_id).priority,
    expectedDisposition: label.generation_disposition,
    candidateDisposition: candidate.byId.get(label.sample_id).generationDisposition,
    urgency: candidate.byId.get(label.sample_id).urgency,
    rawUrgencyScore: output.urgencyScore ?? null,
    calibratedUrgencyProbabilities: output.urgencyCalibratedProbabilities ?? null,
    policyReasons: candidate.byId.get(label.sample_id).policyReasons ?? [],
    channel: source?.channel ?? null,
  };
});
const productGrid = ["model", "source", "source_if_unknown", ...[0.5, 0.6, 0.7, 0.8, 0.9].map((threshold) => `source_if_confidence_below_${threshold}`)].map((policy) => {
  let matches = 0;
  let sourceAvailable = 0;
  let overrides = 0;
  for (const label of selected) {
    const output = candidate.modelOutput.get(label.sample_id);
    const modelProduct = output?.productModelChoice ?? candidate.byId.get(label.sample_id).product;
    const sourceProduct = candidate.source.get(label.sample_id)?.source_product;
    const knownSource = taxonomy.products.includes(sourceProduct) && sourceProduct !== "Não Identificado";
    if (knownSource) sourceAvailable += 1;
    const modelConfidence = output?.productProbabilities?.[modelProduct] ?? 0;
    const shouldOverride = knownSource && (policy === "source" || (policy === "source_if_unknown" && modelProduct === "Não Identificado") || (policy.startsWith("source_if_confidence_below_") && modelConfidence < Number(policy.split("_").at(-1))));
    const selectedProduct = shouldOverride ? sourceProduct : modelProduct;
    if (shouldOverride && selectedProduct !== modelProduct) overrides += 1;
    matches += Number(selectedProduct === label.product);
  }
  return { policy, matches, agreement: matches / selected.length, sourceAvailable, overrides };
});
function temperatureScale(probs, temperature) {
  const entries = Object.entries(probs).filter(([, p]) => Number.isFinite(p) && p >= 0);
  if (!entries.length) return null;
  const scaled = entries.map(([key, p]) => [key, Math.pow(Math.max(p, 1e-8), 1 / temperature)]);
  const total = scaled.reduce((sum, [, p]) => sum + p, 0);
  return Object.fromEntries(scaled.map(([key, p]) => [key, p / total]));
}
function probabilityRows(rows, temperature = 1) {
  return rows.map((row) => {
    const output = candidate.modelOutput.get(row.sample_id);
    const probs = output?.categoryProbabilities;
    if (!probs || Object.keys(probs).length !== byClass.size) return null;
    const distribution = temperatureScale(probs, temperature);
    return { gold: row.category, predicted: candidate.byId.get(row.sample_id).category, probs: distribution };
  }).filter(Boolean);
}
const development = labels.filter((row) => splitById.get(row.sample_id) === "development");
const completeProbabilities = probabilityRows(development).length === development.length;
let calibration = { status: "unavailable", reason: "full category distribution was not retained for every sample" };
if (completeProbabilities) {
  const nll = (rows) => -rows.reduce((sum, row) => sum + Math.log(Math.max(row.probs[row.gold] ?? 0, 1e-8)), 0) / rows.length;
  const candidates = Array.from({ length: 91 }, (_, i) => 0.5 + i * 0.05);
  const fittedTemperature = candidates.reduce((best, temp) => nll(probabilityRows(development, temp)) < nll(probabilityRows(development, best)) ? temp : best, 1);
  const current = probabilityRows(selected);
  const scaled = probabilityRows(selected, fittedTemperature);
  const brier = (rows) => rows.reduce((sum, row) => sum + [...byClass.keys()].reduce((part, key) => part + ((row.probs[key] ?? 0) - Number(key === row.gold)) ** 2, 0), 0) / rows.length;
  const ece = (rows) => {
    let error = 0;
    for (let bin = 0; bin < 10; bin += 1) {
      const group = rows.filter((row) => { const p = row.probs[row.predicted] ?? 0; return p >= bin / 10 && (bin === 9 ? p <= 1 : p < (bin + 1) / 10); });
      if (group.length) error += group.length / rows.length * Math.abs(group.reduce((sum, row) => sum + Number(row.predicted === row.gold), 0) / group.length - group.reduce((sum, row) => sum + (row.probs[row.predicted] ?? 0), 0) / group.length);
    }
    return error;
  };
  const coverage = (rows) => [0.5, 0.7, 0.8, 0.9, 0.95].map((threshold) => { const accepted = rows.filter((row) => (row.probs[row.predicted] ?? 0) >= threshold); return { threshold, accepted: accepted.length, coverage: accepted.length / rows.length, errorRate: accepted.length ? 1 - accepted.filter((row) => row.predicted === row.gold).length / accepted.length : null }; });
  calibration = { status: "ai_draft_exploratory_only", fittedOn: "development", temperature: fittedTemperature, raw: { brier: brier(current), ece10: ece(current), riskCoverage: coverage(current) }, temperatureScaled: { brier: brier(scaled), ece10: ece(scaled), riskCoverage: coverage(scaled) } };
}
if (calibrator) calibration = { ...calibration, artifact: calibrator, status: calibrator.status };
const confidenceRows = selected.map((label) => {
  const output = candidate.modelOutput.get(label.sample_id);
  const probabilities = output?.categoryProbabilities;
  if (!probabilities) return null;
  const temperature = calibrator?.temperatures?.category ?? 1;
  const scaled = temperatureScale(probabilities, temperature);
  const prediction = candidate.byId.get(label.sample_id).category;
  return { sampleId: label.sample_id, gold: label.category, prediction, calibratedConfidence: scaled[prediction] ?? 0, probabilities: scaled };
}).filter(Boolean);
const confidencePolicyReport = {
  mode: confidencePolicy,
  status: confidencePolicy === "experimental" ? "ai_draft_experimental_only" : "disabled",
  thresholds: confidencePolicy === "experimental" ? [0.5, 0.6, 0.7, 0.8, 0.9, 0.95].map((threshold) => {
    const accepted = confidenceRows.filter((row) => row.calibratedConfidence >= threshold);
    const correct = accepted.filter((row) => row.prediction === row.gold).length;
    return { threshold, accepted: accepted.length, abstained: confidenceRows.length - accepted.length, coverage: confidenceRows.length ? accepted.length / confidenceRows.length : 0, conditionalAgreement: accepted.length ? correct / accepted.length : null, errorRate: accepted.length ? 1 - correct / accepted.length : null };
  }) : [],
};
const optionOrderRobustness = optionOrderReportPath
  ? JSON.parse(readFileSync(resolve(root, optionOrderReportPath), "utf8"))
  : { status: "not_run", promotionBlocked: null };
const gates = phase === "full" ? {
  ...Object.fromEntries(fields.map((field) => [field, { passed: candidateMetrics.matches[field] >= manifest.minimum_matches[field], actual: candidateMetrics.matches[field], required: manifest.minimum_matches[field] }])),
  categoryMacroF1: { passed: candidateMetrics.categoryMacroF1 >= manifest.minimum_category_macro_f1, actual: candidateMetrics.categoryMacroF1, required: manifest.minimum_category_macro_f1 },
  p95DecisionMs: { passed: candidateMetrics.p95DecisionMs <= manifest.maximum_p95_decision_ms, actual: candidateMetrics.p95DecisionMs, maximum: manifest.maximum_p95_decision_ms },
  ...Object.fromEntries(Object.entries(manifest.baseline.threat_matches).map(([field, required]) => [`threat_${field}`, { passed: candidateMetrics.threatMatches[field] >= required, actual: candidateMetrics.threatMatches[field], required }])),
} : null;
const holdoutNoRegression = phase === "test" ? ["category", "priority", "generationDisposition"].every((field) => candidateMetrics.matches[field] >= baselineMetrics.matches[field]) : null;
const report = { reportType: "finguard_gate_report", referenceType: manifest.reference_type, phase, runId: candidate.run.id, baselineRunId: baseline.run.id, datasetHash: candidate.run.dataset_hash, promptHash: candidate.run.prompt_hash, configHash: candidate.run.config_hash, candidate: candidateMetrics, baseline: baselineMetrics, urgencyGrid: ["development", "validation"].includes(phase) ? urgencyGrid : null, productGrid: ["development", "validation"].includes(phase) ? productGrid : null, priorityDiagnostics: phase === "full" ? priorityDiagnostics : null, calibration, confidencePolicy: confidencePolicyReport, abstentionRiskCoverage: confidencePolicyReport.thresholds, optionOrderRobustness, gates, holdoutNoRegression, passed: gates ? Object.values(gates).every((gate) => gate.passed) : holdoutNoRegression };
const output = resolve(runDir, option("output", phase === "full" ? "gate_report.json" : `gate_report.${phase}.json`));
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, phase, passed: report.passed, candidate: candidateMetrics.agreement, baseline: baselineMetrics.agreement, categoryMacroF1: candidateMetrics.categoryMacroF1, p95DecisionMs: candidateMetrics.p95DecisionMs, calibration: calibration.status }, null, 2));
if (gates && !report.passed) process.exitCode = 1;
