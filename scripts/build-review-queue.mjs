#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outputDir = resolve(root, process.env.BENCHMARK_OUTPUT_DIR ?? "artifacts/v0-laya-local/full");
const databasePath = resolve(outputDir, "benchmark.sqlite");
const outputPath = resolve(outputDir, "review_queue.jsonl");
const db = new DatabaseSync(databasePath, { readOnly: true });
const latestRun = db.prepare("SELECT id FROM benchmark_run ORDER BY started_at DESC LIMIT 1").get();
if (!latestRun) throw new Error(`no benchmark run found in ${databasePath}`);
const rows = db.prepare(`SELECT run_id, sample_id, category, product, urgency, risk, confidence_json, priority, generation_disposition,
  CASE
    WHEN product = 'Não Identificado' THEN 'unknown_product'
    WHEN json_extract(confidence_json, '$.category') < 0.6 THEN 'low_category_confidence'
    WHEN json_extract(confidence_json, '$.product') < 0.6 THEN 'low_product_confidence'
    WHEN json_extract(confidence_json, '$.urgency') < 0.6 THEN 'low_urgency_confidence'
    WHEN priority >= 100 THEN 'critical_priority'
    ELSE 'policy_or_label_divergence'
  END AS review_reason,
  'internal_restricted' AS data_class
  FROM sample_execution
  WHERE run_id = ? AND (priority >= 70 OR product = 'Não Identificado' OR json_extract(confidence_json, '$.category') < 0.6
    OR json_extract(confidence_json, '$.product') < 0.6 OR json_extract(confidence_json, '$.urgency') < 0.6)
  ORDER BY priority DESC, sample_id`).all(String(latestRun.id));

db.close();
writeFileSync(outputPath, rows.map((row) => JSON.stringify({ ...row, confidence: JSON.parse(String(row.confidence_json)) })).join("\n") + (rows.length ? "\n" : ""));
console.log(JSON.stringify({ status: "completed", output: outputPath, count: rows.length, dataClass: "internal_restricted" }, null, 2));
