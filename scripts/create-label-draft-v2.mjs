#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const input = resolve(root, process.env.LABELS_V1 ?? "datasets/gold/finguard/labels-ai-draft-v1.csv");
const source = resolve(root, process.env.FINGUARD_SOURCE ?? "datasets/source/finguard/dataset_finguard_desafio_3.csv");
const output = resolve(root, process.env.LABELS_V2 ?? "datasets/gold/finguard/labels-ai-draft-v2.csv");

function parseCsv(content) {
  const rows = []; let row = []; let field = ""; let quoted = false;
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
  if (quoted) throw new Error(`unterminated CSV field in ${input}`);
  if (field || row.length) { row.push(field.replace(/\r$/, "")); if (row.some(Boolean)) rows.push(row); }
  const headers = rows.shift()?.map((value) => value.replace(/^\uFEFF/, "").trim()) ?? [];
  return rows.map((values) => Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ""])));
}

function canonicalText(value) {
  return value.replace(/^\uFEFF/, "").normalize("NFC").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").split("\n").map((line) => line.trim()).join("\n").trim();
}
function textHash(value) { return createHash("sha256").update(canonicalText(value)).digest("hex"); }
function csvEscape(value) { const text = String(value ?? ""); return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }

const labels = parseCsv(readFileSync(input, "utf8"));
const sourceRows = parseCsv(readFileSync(source, "utf8"));
const sourceById = new Map(sourceRows.map((row) => [row.id, row]));
const missing = [];
const rows = labels.map((label) => {
  const sourceRow = sourceById.get(label.sample_id);
  if (!sourceRow) { missing.push(label.sample_id); return label; }
  return { ...label, source_text_hash: textHash(sourceRow.texto_reclamacao), schema_version: "labels-ai-draft-v2", derived_from: "labels-ai-draft-v1", hash_scheme: "canonical-text-v1" };
});
if (missing.length) throw new Error(`source rows missing for labels: ${missing.join(", ")}`);
const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
writeFileSync(output, `${headers.map(csvEscape).join(",")}\n${rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")).join("\n")}\n`);
console.log(JSON.stringify({ status: "completed", input, source, output, labels: rows.length, hashScheme: "canonical-text-v1" }, null, 2));
