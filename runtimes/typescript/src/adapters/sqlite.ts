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

export class SqliteRunStore {
  private readonly db: DatabaseSync;

  constructor(databasePath: string, workspaceRoot: string) {
    this.db = new DatabaseSync(databasePath);
    this.db.exec(readFileSync(join(workspaceRoot, "platform/database/migrations/0001_v0.sql"), "utf8"));
  }

  beginRun(metadata: RunMetadata): void {
    this.db.prepare(
      `INSERT INTO benchmark_run (
        id, status, data_class, pack_id, pack_version, git_commit,
        dataset_hash, taxonomy_hash, policy_hash, prompt_hash, config_hash,
        decision_model, runtime_name, runtime_version, execution_profile,
        cpu_limit, memory_limit_mib, concurrency, image_digest,
        pipeline_config_json, started_at
      ) VALUES (?, 'running', 'internal_restricted', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'node', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      metadata.id,
      metadata.pack.id,
      metadata.pack.version,
      metadata.gitCommit,
      metadata.datasetHash,
      metadata.taxonomyHash,
      metadata.policyHash,
      metadata.promptHash,
      metadata.configHash,
      metadata.decisionModel,
      metadata.runtimeVersion,
      metadata.environment.profile,
      metadata.environment.cpuLimit,
      metadata.environment.memoryLimitMiB,
      metadata.environment.concurrency,
      metadata.environment.imageDigest,
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
        priority, generation_disposition, public_summary, decision_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    );
  }

  completeRun(runId: string, finishedAt: string): void {
    this.db.prepare("UPDATE benchmark_run SET status = 'completed', finished_at = ? WHERE id = ?").run(finishedAt, runId);
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
        execution_profile, cpu_limit, memory_limit_mib, concurrency, image_digest, started_at, finished_at
       FROM benchmark_run WHERE id = ?`
    ).get(runId) as Record<string, unknown> | undefined;
    if (!row) throw new Error(`run not found: ${runId}`);
    return row;
  }

  close(): void {
    this.db.close();
  }
}
