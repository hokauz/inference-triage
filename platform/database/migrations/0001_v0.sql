PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS benchmark_run (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  data_class TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  pack_version TEXT NOT NULL,
  git_commit TEXT,
  dataset_hash TEXT NOT NULL,
  taxonomy_hash TEXT NOT NULL,
  policy_hash TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  config_hash TEXT NOT NULL,
  decision_model TEXT NOT NULL,
  runtime_name TEXT NOT NULL,
  runtime_version TEXT NOT NULL,
  execution_profile TEXT NOT NULL,
  cpu_limit TEXT NOT NULL,
  memory_limit_mib INTEGER NOT NULL,
  concurrency INTEGER NOT NULL,
  image_digest TEXT,
  pipeline_config_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS sample_restricted (
  run_id TEXT NOT NULL REFERENCES benchmark_run(id),
  sample_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  channel TEXT NOT NULL,
  source_product TEXT,
  source_status TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  data_class TEXT NOT NULL DEFAULT 'raw_restricted',
  PRIMARY KEY (run_id, sample_id)
);

CREATE TABLE IF NOT EXISTS sample_execution (
  run_id TEXT NOT NULL,
  sample_id TEXT NOT NULL,
  category TEXT NOT NULL,
  product TEXT NOT NULL,
  urgency TEXT NOT NULL,
  risk TEXT NOT NULL,
  threats_json TEXT NOT NULL,
  confidence_json TEXT NOT NULL,
  priority INTEGER NOT NULL,
  generation_disposition TEXT NOT NULL,
  public_summary TEXT NOT NULL,
  decision_ms REAL NOT NULL,
  PRIMARY KEY (run_id, sample_id),
  FOREIGN KEY (run_id, sample_id) REFERENCES sample_restricted(run_id, sample_id)
);

CREATE VIEW IF NOT EXISTS report_public_samples AS
SELECT
  e.run_id,
  e.sample_id,
  e.category,
  e.product,
  e.urgency,
  e.risk,
  e.threats_json,
  e.confidence_json,
  e.priority,
  e.generation_disposition,
  e.public_summary,
  e.decision_ms,
  'report_public' AS data_class
FROM sample_execution AS e;

CREATE VIEW IF NOT EXISTS report_run_metrics AS
SELECT
  run_id,
  COUNT(*) AS sample_count,
  AVG(decision_ms) AS average_decision_ms,
  MAX(priority) AS maximum_priority,
  SUM(CASE WHEN generation_disposition = 'escalation_required' THEN 1 ELSE 0 END) AS escalated_count,
  SUM(CASE WHEN generation_disposition = 'priority_requested' THEN 1 ELSE 0 END) AS priority_requested_count
FROM sample_execution
GROUP BY run_id;
