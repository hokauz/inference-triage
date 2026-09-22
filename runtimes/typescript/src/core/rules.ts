import { containsPii } from "./redaction.js";
import type { DecisionResult, IngestedComplaint, Taxonomy, ThreatDetection } from "./types.js";

function normalize(text: string): string { return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function has(text: string, patterns: RegExp[]): boolean { return patterns.some((pattern) => pattern.test(text)); }
function taxonomyValue(values: string[], expected: string): string { const target = normalize(expected); return values.find((value) => normalize(value) === target) ?? expected; }

export function detectThreats(text: string): ThreatDetection {
  const normalized = normalize(text);
  const externalUrl = /https?:\/\/\S+/.test(text);
  const promptInjection = has(normalized, [/ignore .*instru/, /ignore .*instruction/, /system prompt/, /modo irrestrito/, /do anything now/, /\bdan\b/, /burlar .*restric/, /desative .*guardrail/]);
  const unauthorizedDataAccess = has(normalized, [/dados pessoais .*clientes/, /lista .*cpfs?/, /historico .*reclam/, /todos os clientes/, /numero.*conta.*clientes/, /dados .*terceiros/]);
  const exfiltrationRequest = has(normalized, [/base64/, /endpoint externo/, /envie .*dados/, /envie .*cpf/, /envie .*conta/, /forneca .*dados/, /exfiltr/, /gere .*relatorio .*dados/, /compartilh.*cpf/]);
  return { piiPresent: containsPii(text), promptInjection, exfiltrationRequest, unauthorizedDataAccess, externalExfiltration: externalUrl && (exfiltrationRequest || promptInjection || unauthorizedDataAccess) };
}

export interface PreliminaryDecision { category: string; product: string; urgency: string; confidence: DecisionResult["confidence"]; }

export function applyDeterministicRules(complaint: IngestedComplaint, taxonomy: Taxonomy, preliminary: PreliminaryDecision): DecisionResult {
  const startedAt = performance.now();
  const text = normalize(complaint.rawText);
  const channel = normalize(complaint.channel);
  const threats = detectThreats(complaint.rawText);
  const criticalChannel = channel === "banco central" || channel === "procon";
  const fraud = has(text, [/fraud/, /nao autoriz/, /não autoriz/, /nao reconhec/, /não reconhec/, /clonad/, /golpe/, /roubaram/]);
  const regulatory = has(text, [/banco central/, /procon/, /justica/, /justiça/, /judicial/, /lgpd/, /compliance/]);
  const vulnerable = has(text, [/desesper/, /sem dormir/, /reserva de emergencia/, /reserva de emergência/, /meu filho/, /nao aguento mais/, /não aguento mais/]);
  const repeated = has(text, [/terceira vez/, /segunda vez/, /varias vezes/, /várias vezes/, /mais de [0-9]+ vezes/, /ninguem resolve/, /ninguém resolve/]);
  const highValue = [...complaint.rawText.matchAll(/R\$\s*([\d.]+(?:,\d{2})?)/g)].some((match) => Number.parseFloat(match[1].replace(/\./g, "").replace(",", ".")) > 500);
  const reputational = has(text, [/redes sociais/, /reclame aqui/, /imprensa/, /jornal/, /viral/]);
  let urgency = preliminary.urgency;
  const policyReasons: string[] = [];
  let urgencyConfidence = preliminary.confidence.urgency;
  if (criticalChannel || fraud || regulatory || vulnerable) { urgency = taxonomyValue(taxonomy.urgency, "Crítica"); urgencyConfidence = criticalChannel ? 1 : Math.max(urgencyConfidence, 0.9); }
  else if (highValue || repeated || reputational) { urgency = taxonomyValue(taxonomy.urgency, "Alta"); urgencyConfidence = Math.max(urgencyConfidence, 0.82); }
  if (criticalChannel) policyReasons.push("critical_channel");
  if (fraud) policyReasons.push("fraud_signal");
  if (regulatory) policyReasons.push("regulatory_signal");
  if (vulnerable) policyReasons.push("vulnerability_signal");
  if (highValue) policyReasons.push("high_value");
  if (repeated) policyReasons.push("repeated_complaint");
  if (reputational) policyReasons.push("reputational_signal");
  let risk = taxonomyValue(taxonomy.riskLevels, "Baixo");
  let riskConfidence = 0.65;
  if (criticalChannel || fraud || regulatory || threats.promptInjection || threats.exfiltrationRequest || threats.unauthorizedDataAccess) { risk = taxonomyValue(taxonomy.riskLevels, "Crítico"); riskConfidence = criticalChannel ? 1 : 0.9; }
  else if (vulnerable || reputational || threats.piiPresent) { risk = taxonomyValue(taxonomy.riskLevels, "Alto"); riskConfidence = 0.8; }
  else if (urgency === taxonomyValue(taxonomy.urgency, "Alta") || urgency === taxonomyValue(taxonomy.urgency, "Média")) { risk = taxonomyValue(taxonomy.riskLevels, "Médio"); riskConfidence = 0.7; }
  let priority = 10; let generationDisposition: DecisionResult["routing"]["generationDisposition"] = "none";
  if (risk === taxonomyValue(taxonomy.riskLevels, "Crítico") || urgency === taxonomyValue(taxonomy.urgency, "Crítica")) { priority = 100; generationDisposition = "escalation_required"; }
  else if (risk === taxonomyValue(taxonomy.riskLevels, "Alto") || urgency === taxonomyValue(taxonomy.urgency, "Alta")) { priority = 70; generationDisposition = "priority_requested"; }
  else if (risk === taxonomyValue(taxonomy.riskLevels, "Médio") || urgency === taxonomyValue(taxonomy.urgency, "Média")) { priority = 40; generationDisposition = "deferred"; }
  return { category: taxonomyValue(taxonomy.categories, preliminary.category), product: taxonomyValue(taxonomy.products, preliminary.product), urgency, risk, threats, confidence: { ...preliminary.confidence, urgency: urgencyConfidence, risk: riskConfidence }, routing: { priority, generationDisposition }, publicSummary: `Reclamação classificada como ${preliminary.category} para ${preliminary.product}, com urgência ${urgency} e risco ${risk}.`, decisionMs: Number((performance.now() - startedAt).toFixed(3)), modelOutput: { category: preliminary.category, product: preliminary.product, urgency: preliminary.urgency, confidence: preliminary.confidence }, policyReasons };
}
