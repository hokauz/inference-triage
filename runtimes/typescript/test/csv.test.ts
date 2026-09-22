import assert from "node:assert/strict";
import { unlinkSync, writeFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";

import { loadTaxonomy } from "../src/core/assets.js";
import { ingestCsv } from "../src/core/csv.js";

const root = process.cwd();
const taxonomy = loadTaxonomy(resolve(root, "assets/taxonomies/finguard/taxonomy-v1.yaml"));

test("ingests the FinGuard CSV fixture and profiles missing products", () => {
  const result = ingestCsv(resolve(root, "checks/e2e/v0/fixtures/complaints.csv"), taxonomy);
  assert.equal(result.complaints.length, 3);
  assert.equal(result.report.rejectedCount, 0);
  assert.equal(result.report.inputCount, 3);
  assert.match(result.datasetHash, /^[a-f0-9]{64}$/);
});

test("rejects duplicate IDs without retaining the rejected row", () => {
  const path = resolve(root, "checks/e2e/v0/fixtures/duplicate.csv");
  const content = [
    "id,data_reclamacao,canal,texto_reclamacao,produto,status",
    "duplicate-1,2026-01-01,SAC,Primeiro texto,,Aberta",
    "duplicate-1,2026-01-02,SAC,Segundo texto,,Aberta",
  ].join("\n");
  writeFileSync(path, content, "utf8");
  try {
    const result = ingestCsv(path, taxonomy);
    assert.equal(result.complaints.length, 1);
    assert.equal(result.report.rejectedCount, 1);
    assert.deepEqual(result.report.rejectedRows[0].reasons, ["duplicate_id"]);
  } finally {
    unlinkSync(path);
  }
});
