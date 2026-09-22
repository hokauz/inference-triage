import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { loadFinGuardPack, loadTaxonomy, fileHash, promptHash } from "../core/assets.js";
import { ingestCsv } from "../core/csv.js";
import { canonicalJson, sha256 } from "../core/hashing.js";
import { MockDecisionModel } from "../core/mock-decision-model.js";
import type { ExecutionEnvironment } from "../core/types.js";
import { SqliteRunStore } from "../adapters/sqlite.js";

export interface V0Options {
  inputPath: string;
  outputDir: string;
  packPath: string;
  mode: "mock";
  workspaceRoot?: string;
}

function gitCommit(root: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function executionEnvironment(): ExecutionEnvironment {
  return {
    profile: process.env.INFERENCE_TRIAGE_EXECUTION_PROFILE ?? "local",
    cpuLimit: process.env.INFERENCE_TRIAGE_CPU_LIMIT ?? "unbounded",
    memoryLimitMiB: Number.parseInt(process.env.INFERENCE_TRIAGE_MEMORY_LIMIT_MIB ?? "0", 10),
    concurrency: Number.parseInt(process.env.INFERENCE_TRIAGE_CONCURRENCY ?? "1", 10),
    imageDigest: process.env.INFERENCE_TRIAGE_IMAGE_DIGEST ?? null,
  };
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function runV0(options: V0Options): { runId: string; outputDir: string } {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const inputPath = resolve(options.inputPath);
  const outputDir = resolve(options.outputDir);
  const packPath = resolve(options.packPath);
  mkdirSync(outputDir, { recursive: true });

  const pack = loadFinGuardPack(workspaceRoot, packPath);
  if (pack.id !== "finguard") throw new Error(`V0 only supports the finguard pack, received ${pack.id}`);
  const taxonomy = loadTaxonomy(pack.taxonomyPath);
  const ingestion = ingestCsv(inputPath, taxonomy);
  const model = new MockDecisionModel();
  const environment = executionEnvironment();
  const taxonomyHash = fileHash(pack.taxonomyPath);
  const policyHash = fileHash(pack.policyPath);
  const promptsHash = promptHash(pack.promptPaths);
  const pipelineConfig = {
    mode: options.mode,
    decisionModel: model.id,
    packId: pack.id,
    packVersion: pack.version,
    taxonomyVersion: taxonomy.version,
    execution: environment,
  };
  const configHash = sha256(canonicalJson({
    pipelineConfig,
    taxonomyHash,
    policyHash,
    promptsHash,
  }));
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const store = new SqliteRunStore(resolve(outputDir, "benchmark.sqlite"), workspaceRoot);

  try {
    store.beginRun({
      id: runId,
      pack,
      gitCommit: gitCommit(workspaceRoot),
      datasetHash: ingestion.datasetHash,
      taxonomyHash,
      policyHash,
      promptHash: promptsHash,
      configHash,
      decisionModel: model.id,
      runtimeVersion: process.version,
      environment,
      pipelineConfig,
      startedAt,
    });
    for (const complaint of ingestion.complaints) {
      store.persistSample(runId, complaint, model.decide(complaint, taxonomy));
    }
    store.completeRun(runId, new Date().toISOString());

    const publicRun = store.publicRun(runId);
    const publicSamples = store.publicSamples(runId);
    writeJson(resolve(outputDir, "benchmark_run.json"), {
      ...publicRun,
      data_class: "report_public",
      input_file: basename(inputPath),
    });
    writeFileSync(
      resolve(outputDir, "sample_executions.jsonl"),
      publicSamples.map((sample) => JSON.stringify(sample)).join("\n") + (publicSamples.length ? "\n" : ""),
      "utf8",
    );
    writeJson(resolve(outputDir, "ingestion_report.json"), {
      ...ingestion.report,
      data_class: "internal_restricted",
      dataset_hash: ingestion.datasetHash,
    });
  } finally {
    store.close();
  }

  return { runId, outputDir };
}
