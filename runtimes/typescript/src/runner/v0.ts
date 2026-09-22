import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { loadFinGuardPack, loadTaxonomy, fileHash, modelBundleHash, promptHash } from "../core/assets.js";
import { ingestCsv } from "../core/csv.js";
import { canonicalJson, sha256 } from "../core/hashing.js";
import { MockDecisionModel } from "../core/mock-decision-model.js";
import { LayaDecisionModel } from "../adapters/laya.js";
import { loadDecisionPrompt, reorderDecisionPrompt, type OptionOrder } from "../core/decision-prompt.js";
import type { ExecutionEnvironment } from "../core/types.js";
import { SqliteRunStore } from "../adapters/sqlite.js";

export interface V0Options {
  inputPath: string;
  outputDir: string;
  packPath: string;
  mode: "mock" | "laya";
  modelDir?: string;
  modelRevision?: string;
  modelHash?: string;
  decisionPromptPath?: string;
  urgencyHighBoundary?: number;
  productPolicy?: "model" | "source_if_known";
  optionOrder?: OptionOrder;
  confidencePolicy?: "none" | "experimental";
  layaThreads?: number;
  workspaceRoot?: string;
}

function gitCommit(root: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function executionEnvironment(model?: Partial<ExecutionEnvironment>): ExecutionEnvironment {
  return {
    profile: process.env.INFERENCE_TRIAGE_EXECUTION_PROFILE ?? "local",
    cpuLimit: process.env.INFERENCE_TRIAGE_CPU_LIMIT ?? "unbounded",
    memoryLimitMiB: Number.parseInt(process.env.INFERENCE_TRIAGE_MEMORY_LIMIT_MIB ?? "0", 10),
    concurrency: Number.parseInt(process.env.INFERENCE_TRIAGE_CONCURRENCY ?? "1", 10),
    imageDigest: process.env.INFERENCE_TRIAGE_IMAGE_DIGEST ?? null,
    ...model,
  };
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeCheckpoint(path: string, value: unknown): void {
  const temporary = `${path}.tmp`;
  writeJson(temporary, value);
  renameSync(temporary, path);
}

export async function runV0(options: V0Options): Promise<{ runId: string; outputDir: string }> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const inputPath = resolve(options.inputPath);
  const outputDir = resolve(options.outputDir);
  const packPath = resolve(options.packPath);
  if (options.mode === "laya" && (existsSync(resolve(outputDir, "benchmark_run.json")) || existsSync(resolve(outputDir, "benchmark.sqlite")))) {
    throw new Error(`output directory already contains a benchmark: ${outputDir}`);
  }
  mkdirSync(outputDir, { recursive: true });

  const pack = loadFinGuardPack(workspaceRoot, packPath);
  if (pack.id !== "finguard") throw new Error(`V0 only supports the finguard pack, received ${pack.id}`);
  const taxonomy = loadTaxonomy(pack.taxonomyPath);
  const decisionPromptPath = resolve(options.decisionPromptPath ?? pack.decisionPromptPath);
  const optionOrder = options.optionOrder ?? "canonical";
  const decisionPrompt = options.mode === "laya" ? reorderDecisionPrompt(loadDecisionPrompt(decisionPromptPath, taxonomy), optionOrder) : null;
  const urgencyHighBoundary = options.urgencyHighBoundary ?? 1.5;
  if (!Number.isFinite(urgencyHighBoundary) || urgencyHighBoundary < 0.5 || urgencyHighBoundary > 2.5) throw new Error("urgency high boundary must be between 0.5 and 2.5");
  const productPolicy = options.productPolicy ?? "model";
  if (!["model", "source_if_known"].includes(productPolicy)) throw new Error(`unsupported product policy: ${productPolicy}`);
  const confidencePolicy = options.confidencePolicy ?? "none";
  if (!["none", "experimental"].includes(confidencePolicy)) throw new Error(`unsupported confidence policy: ${confidencePolicy}`);
  const ingestion = ingestCsv(inputPath, taxonomy);
  if (options.mode === "laya" && !(options.modelDir ?? process.env.LAYA_MODEL_DIR)) throw new Error("Laya requires --model-dir or LAYA_MODEL_DIR pointing to a local ONNX bundle");
  const modelDir = options.modelDir ?? process.env.LAYA_MODEL_DIR;
  const modelRevision = options.modelRevision ?? process.env.LAYA_REVISION ?? process.env.LAYA_MODEL_REVISION;
  const configuredModelHash = options.modelHash ?? process.env.LAYA_MODEL_HASH;
  const modelHash = configuredModelHash && configuredModelHash !== "unknown"
    ? configuredModelHash
    : (options.mode === "laya" && modelDir ? await modelBundleHash(modelDir) : null);
  const modelStartedAt = performance.now();
  const model = options.mode === "laya"
    ? await LayaDecisionModel.load({ modelDir: modelDir ?? "", revision: modelRevision, threads: options.layaThreads ?? Number.parseInt(process.env.LAYA_THREADS ?? "1", 10), prompt: decisionPrompt!, taxonomy, urgencyHighBoundary, productPolicy })
    : new MockDecisionModel();
  const environment = executionEnvironment(options.mode === "laya" ? { modelPackage: "@receptron/laya@0.1.2", modelRevision: modelRevision && modelRevision !== "unknown" ? modelRevision : null, modelHash, modelDir: modelDir?.replace(`${workspaceRoot}/`, "") ?? null, executionProvider: "cpu", onnxThreads: options.layaThreads ?? Number.parseInt(process.env.LAYA_THREADS ?? "1", 10), modelLoadMs: Number((performance.now() - modelStartedAt).toFixed(3)) } : undefined);
  const taxonomyHash = fileHash(pack.taxonomyPath);
  const policyHash = fileHash(pack.policyPath);
  const promptsHash = promptHash([decisionPromptPath, ...pack.promptPaths.slice(1)]);
  const pipelineConfig = {
    mode: options.mode,
    decisionModel: model.id,
    packId: pack.id,
    packVersion: pack.version,
    taxonomyVersion: taxonomy.version,
    decisionPromptVersion: decisionPrompt?.version ?? null,
    decisionPromptMode: decisionPrompt?.mode ?? null,
    decisionPromptAsset: options.mode === "laya" ? decisionPromptPath.replace(`${workspaceRoot}/`, "") : null,
    urgencyHighBoundary,
    productPolicy,
    optionOrder,
    confidencePolicy,
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
  const checkpointPath = resolve(outputDir, "benchmark_checkpoint.json");
  const totalSamples = ingestion.complaints.length;
  const progressInterval = Math.max(1, Number.parseInt(process.env.INFERENCE_TRIAGE_PROGRESS_INTERVAL ?? "25", 10));
  const progressStartedAt = performance.now();
  let processedCount = 0;
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
    writeCheckpoint(checkpointPath, { runId, status: "running", processed: 0, total: totalSamples, updatedAt: new Date().toISOString() });
    for (const [index, complaint] of ingestion.complaints.entries()) {
      store.persistSample(runId, complaint, await model.decide(complaint, taxonomy));
      const processed = index + 1;
      processedCount = processed;
      writeCheckpoint(checkpointPath, { runId, status: "running", processed, total: totalSamples, lastSampleId: complaint.id, updatedAt: new Date().toISOString() });
      if (processed % progressInterval === 0 || processed === totalSamples) {
        const elapsedSeconds = (performance.now() - progressStartedAt) / 1000;
        const rate = processed / Math.max(elapsedSeconds, 0.001);
        const etaSeconds = (totalSamples - processed) / Math.max(rate, 0.001);
        console.error(`[v0] progress=${processed}/${totalSamples} rate=${rate.toFixed(2)}/s eta=${Math.ceil(etaSeconds)}s`);
      }
    }
    store.completeRun(runId, new Date().toISOString());
    writeCheckpoint(checkpointPath, { runId, status: "completed", processed: totalSamples, total: totalSamples, updatedAt: new Date().toISOString() });

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
  } catch (error) {
    writeCheckpoint(checkpointPath, { runId, status: "failed", processed: processedCount, total: totalSamples, updatedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally {
    await model.close?.();
    store.close();
  }

  return { runId, outputDir };
}
