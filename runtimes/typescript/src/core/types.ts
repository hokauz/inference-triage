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

export type ConfidenceStatus = "probabilistic" | "deterministic" | "invalid" | "experimental";

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
  confidenceStatus?: ConfidenceStatus;
  routing: RoutingDecision;
  publicSummary: string;
  decisionMs: number;
  modelOutput?: {
    category: string;
    product: string;
    urgency: string;
    confidence: DecisionConfidence;
    confidenceStatus?: ConfidenceStatus;
    confidenceStatusByField?: { category: ConfidenceStatus; product: ConfidenceStatus; urgency: ConfidenceStatus; risk: "deterministic" };
    categoryProbabilities?: Record<string, number>;
    categoryRawScores?: Record<string, number>;
    categoryRawScoreKind?: "log_probability" | "logit";
    categoryCalibratedProbabilities?: Record<string, number>;
    productProbabilities?: Record<string, number>;
    productRawScores?: Record<string, number>;
    productRawScoreKind?: "log_probability" | "logit";
    productCalibratedProbabilities?: Record<string, number>;
    productModelChoice?: string;
    productRawChoice?: string;
    urgencyProbabilities?: Record<string, number>;
    urgencyRawScores?: Record<string, number>;
    urgencyRawScoreKind?: "log_probability" | "logit";
    urgencyCalibratedProbabilities?: Record<string, number>;
    urgencyScore?: number;
    categoryStageProbabilities?: Record<string, number>;
    calibratorVersion?: string;
    confidencePolicy?: "none" | "experimental";
    confidenceReason?: string;
    sourceMetadataOverride?: boolean;
  };
  policyReasons?: string[];
}

export interface DecisionModel {
  readonly id: string;
  decide(complaint: IngestedComplaint, taxonomy: Taxonomy): Promise<DecisionResult>;
  close?(): Promise<void> | void;
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
  decisionPromptPath: string;
}

export interface ExecutionEnvironment {
  profile: string;
  cpuLimit: string;
  memoryLimitMiB: number;
  concurrency: number;
  imageDigest: string | null;
  modelPackage?: string;
  modelRevision?: string | null;
  modelHash?: string | null;
  modelDir?: string | null;
  executionProvider?: string;
  onnxThreads?: number;
  modelLoadMs?: number;
}
