import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { DecisionResult, ExecutionEnvironment, FinGuardPack, IngestedComplaint } from "../core/types.js";

export interface RunMetadata {
  id: string;
  pack: FinGuardPack;
  gitCommit: string | null;
  datasetHash: string;
  taxonomyHash: string;
  policyHash: string;
  promptHash: string;
  configHash: string;
  decisionModel: string;
  runtimeVersion: string;
  environment: ExecutionEnvironment;
  pipelineConfig: Record<string, unknown>;
  startedAt: string;
}

export interface PublicSample {
  runId: string;
  sampleId: string;
  category: string;
  product: string;
  urgency: string;
  risk: string;
  threats: DecisionResult["threats"];
  confidence: DecisionResult["confidence"];
  priority: number;
  generationDisposition: string;
  publicSummary: string;
  decisionMs: number;
  dataClass: "report_public";
}

export interface ReviewInput {
  status: "pending" | "accepted" | "corrected" | "rejected";
  reviewer?: string;
  reason?: string;
  category?: string;
  product?: string;
  urgency?: string;
  risk?: string;
}

export class SqliteRunStore {
  private readonly db: DatabaseSync;

  constructor(databasePath: string, workspaceRoot: string) {
    this.db = new DatabaseSync(databasePath);
    this.db.exec(readFileSync(join(workspaceRoot, "platform/database/migrations/0001_v0.sql"), "utf8"));
    const columns = new Set((this.db.prepare("PRAGMA table_info(sample_execution)").all() as Array<{ name: string }>).map((column) => column.name));
    if (!columns.has("model_output_json")) this.db.exec("ALTER TABLE sample_execution ADD COLUMN model_output_json TEXT");
    if (!columns.has("policy_reasons_json")) this.db.exec("ALTER TABLE sample_execution ADD COLUMN policy_reasons_json TEXT");
  }

  beginRun(metadata: RunMetadata): void {
    this.db.prepare(
      `INSERT INTO benchmark_run (
        id, status, data_class, pack_id, pack_version, git_commit,
        dataset_hash, taxonomy_hash, policy_hash, prompt_hash, config_hash,
        decision_model, runtime_name, runtime_version, execution_profile,
        cpu_limit, memory_limit_mib, concurrency, image_digest,
        model_package, model_revision, model_hash, model_dir, execution_provider, onnx_threads, model_load_ms,
        pipeline_config_json, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      metadata.id,
      "running",
      "internal_restricted",
      metadata.pack.id,
      metadata.pack.version,
      metadata.gitCommit,
      metadata.datasetHash,
      metadata.taxonomyHash,
      metadata.policyHash,
      metadata.promptHash,
      metadata.configHash,
      metadata.decisionModel,
      "node",
      metadata.runtimeVersion,
      metadata.environment.profile,
      metadata.environment.cpuLimit,
      metadata.environment.memoryLimitMiB,
      metadata.environment.concurrency,
      metadata.environment.imageDigest,
      metadata.environment.modelPackage ?? null,
      metadata.environment.modelRevision ?? null,
      metadata.environment.modelHash ?? null,
      metadata.environment.modelDir ?? null,
      metadata.environment.executionProvider ?? null,
      metadata.environment.onnxThreads ?? null,
      metadata.environment.modelLoadMs ?? null,
      JSON.stringify(metadata.pipelineConfig),
      metadata.startedAt,
    );
  }

  persistSample(runId: string, complaint: IngestedComplaint, decision: DecisionResult): void {
    this.db.prepare(
      `INSERT INTO sample_restricted (
        run_id, sample_id, occurred_at, channel, source_product, source_status, raw_text, text_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      runId,
      complaint.id,
      complaint.occurredAt,
      complaint.channel,
      complaint.sourceProduct,
      complaint.sourceStatus,
      complaint.rawText,
      complaint.textHash,
    );
    this.db.prepare(
      `INSERT INTO sample_execution (
        run_id, sample_id, category, product, urgency, risk, threats_json, confidence_json,
        priority, generation_disposition, public_summary, decision_ms, model_output_json, policy_reasons_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      runId,
      complaint.id,
      decision.category,
      decision.product,
      decision.urgency,
      decision.risk,
      JSON.stringify(decision.threats),
      JSON.stringify(decision.confidence),
      decision.routing.priority,
      decision.routing.generationDisposition,
      decision.publicSummary,
      decision.decisionMs,
      JSON.stringify(decision.modelOutput ?? null),
      JSON.stringify(decision.policyReasons ?? []),
    );
    this.db.prepare(
      `INSERT OR IGNORE INTO sample_feedback (run_id, sample_id, review_status)
       VALUES (?, ?, 'pending')`
    ).run(runId, complaint.id);
  }

  completeRun(runId: string, finishedAt: string): void {
    this.db.prepare("UPDATE benchmark_run SET status = 'completed', finished_at = ? WHERE id = ?").run(finishedAt, runId);
  }

  recordReview(runId: string, sampleId: string, review: ReviewInput): void {
    const reviewedAt = new Date().toISOString();
    this.db.prepare(
      `UPDATE sample_feedback SET review_status = ?, reviewed_category = ?, reviewed_product = ?,
        reviewed_urgency = ?, reviewed_risk = ?, reviewer = ?, reviewed_at = ?, review_reason = ?
       WHERE run_id = ? AND sample_id = ?`
    ).run(review.status, review.category ?? null, review.product ?? null, review.urgency ?? null, review.risk ?? null, review.reviewer ?? null, reviewedAt, review.reason ?? null, runId, sampleId);
    this.db.prepare(
      `INSERT INTO review_events (run_id, sample_id, event_type, payload_json, reviewer, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(runId, sampleId, review.status === "corrected" ? "label_corrected" : "reviewed", JSON.stringify(review), review.reviewer ?? null, reviewedAt);
  }

  publicSamples(runId: string): PublicSample[] {
    const rows = this.db.prepare(
      `SELECT run_id, sample_id, category, product, urgency, risk, threats_json, confidence_json,
        priority, generation_disposition, public_summary, decision_ms, data_class
       FROM report_public_samples WHERE run_id = ? ORDER BY sample_id`
    ).all(runId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      runId: String(row.run_id),
      sampleId: String(row.sample_id),
      category: String(row.category),
      product: String(row.product),
      urgency: String(row.urgency),
      risk: String(row.risk),
      threats: JSON.parse(String(row.threats_json)),
      confidence: JSON.parse(String(row.confidence_json)),
      priority: Number(row.priority),
      generationDisposition: String(row.generation_disposition),
      publicSummary: String(row.public_summary),
      decisionMs: Number(row.decision_ms),
      dataClass: "report_public",
    }));
  }

  publicRun(runId: string): Record<string, unknown> {
    const row = this.db.prepare(
      `SELECT id, status, pack_id, pack_version, git_commit, dataset_hash, taxonomy_hash,
        policy_hash, prompt_hash, config_hash, decision_model, runtime_name, runtime_version,
        execution_profile, cpu_limit, memory_limit_mib, concurrency, image_digest,
        model_package, model_revision, model_hash, model_dir, execution_provider, onnx_threads, model_load_ms,
        started_at, finished_at
       FROM benchmark_run WHERE id = ?`
    ).get(runId) as Record<string, unknown> | undefined;
    if (!row) throw new Error(`run not found: ${runId}`);
    return row;
  }

  close(): void {
    this.db.close();
  }
}
