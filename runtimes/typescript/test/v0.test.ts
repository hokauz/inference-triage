import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import test from "node:test";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { runV0 } from "../src/runner/v0.js";

test("V0 persists restricted inputs while exporting only public views", () => {
  const outputDir = mkdtempSync(join(tmpdir(), "inference-triage-v0-test-"));
  const root = resolve(process.cwd());
  try {
    runV0({
      inputPath: resolve(root, "checks/e2e/v0/fixtures/security.csv"),
      outputDir,
      packPath: resolve(root, "assets/packs/finguard/pack.yaml"),
      mode: "mock",
      workspaceRoot: root,
    });
    assert.equal(existsSync(join(outputDir, "benchmark.sqlite")), true);
    assert.equal(existsSync(join(outputDir, "ingestion_report.json")), true);
    const publicOutput = readFileSync(join(outputDir, "sample_executions.jsonl"), "utf8");
    assert.doesNotMatch(publicOutput, /123\.456\.789-00|12345-6|external\.invalid/);

    const db = new DatabaseSync(join(outputDir, "benchmark.sqlite"));
    const restricted = db.prepare("SELECT COUNT(*) AS count FROM sample_restricted").get() as { count: number };
    const publicRows = db.prepare("SELECT COUNT(*) AS count FROM report_public_samples").get() as { count: number };
    const publicColumns = db.prepare("PRAGMA table_info(report_public_samples)").all() as Array<{ name: string }>;
    db.close();
    assert.equal(restricted.count, 2);
    assert.equal(publicRows.count, 2);
    assert.equal(publicColumns.some((column) => column.name === "raw_text"), false);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});
