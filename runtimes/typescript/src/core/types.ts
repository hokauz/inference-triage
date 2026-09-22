export type DataClass = "raw_restricted" | "internal_restricted" | "report_public";

export type GenerationDisposition =
  | "none"
  | "deferred"
  | "priority_requested"
  | "escalation_required";

export interface IngestedComplaint {
  id: string;
  occurredAt: string;
  channel: string;
  rawText: string;
  sourceProduct: string | null;
  sourceStatus: string;
  textHash: string;
}

export interface RejectedRow {
  rowNumber: number;
  reasons: string[];
}

export interface IngestionReport {
  inputCount: number;
  acceptedCount: number;
  rejectedCount: number;
  missingByField: Record<string, number>;
  unexpectedValues: Record<string, string[]>;
  rejectedRows: RejectedRow[];
}

export interface ThreatDetection {
  piiPresent: boolean;
  promptInjection: boolean;
  exfiltrationRequest: boolean;
  unauthorizedDataAccess: boolean;
  externalExfiltration: boolean;
}

export interface DecisionConfidence {
  category: number;
  product: number;
  urgency: number;
  risk: number;
}

export interface RoutingDecision {
  priority: number;
  generationDisposition: GenerationDisposition;
}

export interface DecisionResult {
  category: string;
  product: string;
  urgency: string;
  risk: string;
  threats: ThreatDetection;
  confidence: DecisionConfidence;
  routing: RoutingDecision;
  publicSummary: string;
  decisionMs: number;
}

export interface DecisionModel {
  readonly id: string;
  decide(complaint: IngestedComplaint, taxonomy: Taxonomy): DecisionResult;
}

export interface Taxonomy {
  version: string;
  categories: string[];
  products: string[];
  sentiments: string[];
  urgency: string[];
  riskLevels: string[];
  channels: string[];
  statuses: string[];
  threatTypes: string[];
}

export interface FinGuardPack {
  id: string;
  version: string;
  taxonomyPath: string;
  policyPath: string;
  promptPaths: string[];
}

export interface ExecutionEnvironment {
  profile: string;
  cpuLimit: string;
  memoryLimitMiB: number;
  concurrency: number;
  imageDigest: string | null;
}
