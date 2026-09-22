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
  model_package TEXT,
  model_revision TEXT,
  model_hash TEXT,
  model_dir TEXT,
  execution_provider TEXT,
  onnx_threads INTEGER,
  model_load_ms REAL,
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
  confidence_status TEXT NOT NULL DEFAULT 'probabilistic',
  priority INTEGER NOT NULL,
  generation_disposition TEXT NOT NULL,
  public_summary TEXT NOT NULL,
  decision_ms REAL NOT NULL,
  model_output_json TEXT,
  policy_reasons_json TEXT,
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
  e.confidence_status,
  e.priority,
  e.generation_disposition,
  e.public_summary,
  e.decision_ms,
  'report_public' AS data_class
FROM sample_execution AS e;

CREATE TABLE IF NOT EXISTS sample_feedback (
  run_id TEXT NOT NULL,
  sample_id TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending',
  reviewed_category TEXT,
  reviewed_product TEXT,
  reviewed_urgency TEXT,
  reviewed_risk TEXT,
  reviewer TEXT,
  reviewed_at TEXT,
  review_reason TEXT,
  data_class TEXT NOT NULL DEFAULT 'internal_restricted',
  PRIMARY KEY (run_id, sample_id),
  FOREIGN KEY (run_id, sample_id) REFERENCES sample_restricted(run_id, sample_id)
);

CREATE TABLE IF NOT EXISTS label_candidates (
  candidate_id TEXT PRIMARY KEY,
  source_run_id TEXT NOT NULL,
  dataset_hash TEXT NOT NULL,
  candidate_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'candidate',
  created_at TEXT NOT NULL,
  promoted_at TEXT,
  promoted_by TEXT
);

CREATE TABLE IF NOT EXISTS review_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  sample_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  reviewer TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id, sample_id) REFERENCES sample_restricted(run_id, sample_id)
);

CREATE TABLE IF NOT EXISTS dataset_versions (
  dataset_hash TEXT PRIMARY KEY,
  dataset_path TEXT NOT NULL,
  dataset_kind TEXT NOT NULL,
  parent_dataset_hash TEXT,
  review_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  approved_at TEXT,
  approved_by TEXT
);

CREATE VIEW IF NOT EXISTS review_queue AS
SELECT
  e.run_id,
  e.sample_id,
  e.category,
  e.product,
  e.urgency,
  e.risk,
  e.confidence_json,
  e.priority,
  e.generation_disposition,
  e.model_output_json,
  e.policy_reasons_json,
  CASE
    WHEN e.product = 'Não Identificado' THEN 'unknown_product'
    WHEN json_extract(e.confidence_json, '$.category') < 0.6 THEN 'low_category_confidence'
    WHEN json_extract(e.confidence_json, '$.product') < 0.6 THEN 'low_product_confidence'
    WHEN json_extract(e.confidence_json, '$.urgency') < 0.6 THEN 'low_urgency_confidence'
    WHEN e.priority >= 100 THEN 'critical_priority'
    ELSE 'policy_or_label_divergence'
  END AS review_reason,
  'internal_restricted' AS data_class
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
