import { performance } from "node:perf_hooks";

import { containsPii } from "./redaction.js";
import type { DecisionModel, DecisionResult, IngestedComplaint, Taxonomy, ThreatDetection } from "./types.js";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function has(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function taxonomyValue(values: string[], expected: string): string {
  const target = normalize(expected);
  return values.find((value) => normalize(value) === target) ?? expected;
}

function detectThreats(text: string): ThreatDetection {
  const normalized = normalize(text);
  const externalUrl = /https?:\/\/\S+/.test(text);
  const promptInjection = has(normalized, [
    /ignore .*instru/, /ignore .*instruction/, /system prompt/, /modo irrestrito/,
    /do anything now/, /\bdan\b/, /burlar .*restric/, /desative .*guardrail/,
  ]);
  const unauthorizedDataAccess = has(normalized, [
    /dados pessoais .*clientes/, /lista .*cpfs?/, /historico .*reclam/, /todos os clientes/,
    /numero.*conta.*clientes/, /dados .*terceiros/,
  ]);
  const exfiltrationRequest = has(normalized, [
    /base64/, /endpoint externo/, /envie .*dados/, /envie .*cpf/, /envie .*conta/, /forneca .*dados/, /exfiltr/,
    /gere .*relatorio .*dados/, /compartilh.*cpf/,
  ]);
  return {
    piiPresent: containsPii(text),
    promptInjection,
    exfiltrationRequest,
    unauthorizedDataAccess,
    externalExfiltration: externalUrl && (exfiltrationRequest || promptInjection || unauthorizedDataAccess),
  };
}

function sourceOrInferredProduct(complaint: IngestedComplaint, taxonomy: Taxonomy, text: string): [string, number] {
  const sourceProduct = complaint.sourceProduct;
  if (sourceProduct) {
    const source = taxonomy.products.find((product) => normalize(product) === normalize(sourceProduct));
    if (source) return [source, 0.95];
  }
  const products: Array<[string, RegExp[]]> = [
    ["Cartão de Crédito", [/cartao/, /fatura/, /anuidade/]],
    ["Conta Corrente", [/conta corrente/, /\bpix\b/, /tarifa/, /extrato/]],
    ["Empréstimo", [/emprestimo/, /parcela/, /financiamento/]],
    ["Investimentos", [/investimento/, /resgate/, /rentabilidade/, /fundo/, /cdb/]],
    ["Seguros", [/seguro/, /sinistro/, /apolice/]],
  ];
  for (const [product, patterns] of products) {
    if (has(text, patterns)) return [taxonomyValue(taxonomy.products, product), 0.8];
  }
  return [taxonomyValue(taxonomy.products, "Não Identificado"), 0.35];
}

export class MockDecisionModel implements DecisionModel {
  readonly id = "mock-finguard-v1";

  decide(complaint: IngestedComplaint, taxonomy: Taxonomy): DecisionResult {
    const startedAt = performance.now();
    const text = normalize(complaint.rawText);
    const channel = normalize(complaint.channel);
    const threats = detectThreats(complaint.rawText);
    const criticalChannel = channel === "banco central" || channel === "procon";
    const fraud = has(text, [/fraud/, /nao autoriz/, /não autoriz/, /nao reconhec/, /não reconhec/, /clonad/, /golpe/, /roubaram/]);
    const regulatory = has(text, [/banco central/, /procon/, /justica/, /justiça/, /judicial/, /lgpd/, /compliance/]);
    const vulnerable = has(text, [/desesper/, /sem dormir/, /reserva de emergencia/, /reserva de emergência/, /meu filho/, /nao aguento mais/, /não aguento mais/]);
    const repeated = has(text, [/terceira vez/, /segunda vez/, /varias vezes/, /várias vezes/, /mais de [0-9]+ vezes/, /ninguem resolve/, /ninguém resolve/]);
    const highValue = [...complaint.rawText.matchAll(/R\$\s*([\d.]+(?:,\d{2})?)/g)].some((match) =>
      Number.parseFloat(match[1].replace(/\./g, "").replace(",", ".")) > 500,
    );
    const reputational = has(text, [/redes sociais/, /reclame aqui/, /imprensa/, /jornal/, /viral/]);

    let category = "Outros";
    let categoryConfidence = 0.45;
    if (fraud) {
      category = "Fraude/Segurança";
      categoryConfidence = 0.9;
    } else if (has(text, [/cobranca/, /cobrança/, /estorno/, /tarifa indevida/, /taxa indevida/, /anuidade/])) {
      category = "Cobrança Indevida";
      categoryConfidence = 0.85;
    } else if (has(text, [/cancelar/, /cancelamento/, /encerramento/, /encerrar a conta/])) {
      category = "Cancelamento";
      categoryConfidence = 0.85;
    } else if (has(text, [/atendimento/, /ninguem atende/, /ninguém atende/, /descaso/, /ligacao caiu/, /ligação caiu/])) {
      category = "Atendimento";
      categoryConfidence = 0.8;
    } else if (has(text, [/app/, /aplicativo/, /nao funciona/, /não funciona/, /bloqueado/, /erro/])) {
      category = "Produto/Serviço";
      categoryConfidence = 0.75;
    }

    const [product, productConfidence] = sourceOrInferredProduct(complaint, taxonomy, text);
    let urgency = "Baixa";
    let urgencyConfidence = 0.65;
    if (criticalChannel || fraud || regulatory || vulnerable) {
      urgency = "Crítica";
      urgencyConfidence = criticalChannel ? 1 : 0.9;
    } else if (highValue || repeated || reputational) {
      urgency = "Alta";
      urgencyConfidence = 0.82;
    } else if (category !== "Outros") {
      urgency = "Média";
      urgencyConfidence = 0.7;
    }

    let risk = "Baixo";
    let riskConfidence = 0.65;
    if (criticalChannel || fraud || regulatory || threats.promptInjection || threats.exfiltrationRequest || threats.unauthorizedDataAccess) {
      risk = "Crítico";
      riskConfidence = criticalChannel ? 1 : 0.9;
    } else if (vulnerable || reputational || threats.piiPresent) {
      risk = "Alto";
      riskConfidence = 0.8;
    } else if (urgency === "Alta" || urgency === "Média") {
      risk = "Médio";
      riskConfidence = 0.7;
    }

    let priority = 10;
    let generationDisposition: DecisionResult["routing"]["generationDisposition"] = "none";
    if (risk === "Crítico" || urgency === "Crítica") {
      priority = 100;
      generationDisposition = "escalation_required";
    } else if (risk === "Alto" || urgency === "Alta") {
      priority = 70;
      generationDisposition = "priority_requested";
    } else if (risk === "Médio" || urgency === "Média") {
      priority = 40;
      generationDisposition = "deferred";
    }

    const result: DecisionResult = {
      category: taxonomyValue(taxonomy.categories, category),
      product,
      urgency: taxonomyValue(taxonomy.urgency, urgency),
      risk: taxonomyValue(taxonomy.riskLevels, risk),
      threats,
      confidence: {
        category: categoryConfidence,
        product: productConfidence,
        urgency: urgencyConfidence,
        risk: riskConfidence,
      },
      routing: { priority, generationDisposition },
      publicSummary: `Reclamação classificada como ${category} para ${product}, com urgência ${urgency} e risco ${risk}.`,
      decisionMs: Number((performance.now() - startedAt).toFixed(3)),
    };
    return result;
  }
}
