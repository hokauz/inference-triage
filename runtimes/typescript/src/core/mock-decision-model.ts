import { applyDeterministicRules } from "./rules.js";
import type { DecisionModel, IngestedComplaint, Taxonomy } from "./types.js";

function normalize(text: string): string { return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function has(text: string, patterns: RegExp[]): boolean { return patterns.some((pattern) => pattern.test(text)); }
function taxonomyValue(values: string[], expected: string): string { const target = normalize(expected); return values.find((value) => normalize(value) === target) ?? expected; }

export class MockDecisionModel implements DecisionModel {
  readonly id = "mock-finguard-v1";

  async decide(complaint: IngestedComplaint, taxonomy: Taxonomy) {
    const text = normalize(complaint.rawText);
    const fraud = has(text, [/fraud/, /nao autoriz/, /não autoriz/, /nao reconhec/, /não reconhec/, /clonad/, /golpe/, /roubaram/]);
    let category = "Outros"; let categoryConfidence = 0.45;
    if (fraud) { category = "Fraude/Segurança"; categoryConfidence = 0.9; }
    else if (has(text, [/cobranca/, /cobrança/, /estorno/, /tarifa indevida/, /taxa indevida/, /anuidade/])) { category = "Cobrança Indevida"; categoryConfidence = 0.85; }
    else if (has(text, [/cancelar/, /cancelamento/, /encerramento/, /encerrar a conta/])) { category = "Cancelamento"; categoryConfidence = 0.85; }
    else if (has(text, [/atendimento/, /ninguem atende/, /ninguém atende/, /descaso/, /ligacao caiu/, /ligação caiu/])) { category = "Atendimento"; categoryConfidence = 0.8; }
    else if (has(text, [/app/, /aplicativo/, /nao funciona/, /não funciona/, /bloqueado/, /erro/])) { category = "Produto/Serviço"; categoryConfidence = 0.75; }
    let product = "Não Identificado"; let productConfidence = 0.35;
    const sourceProduct = complaint.sourceProduct;
    if (sourceProduct && taxonomy.products.some((value) => normalize(value) === normalize(sourceProduct))) { product = sourceProduct; productConfidence = 0.95; }
    const productHints: Array<[string, RegExp[]]> = [["Cartão de Crédito", [/cartao/, /fatura/, /anuidade/]], ["Conta Corrente", [/conta corrente/, /\bpix\b/, /tarifa/, /extrato/]], ["Empréstimo", [/emprestimo/, /parcela/, /financiamento/]], ["Investimentos", [/investimento/, /resgate/, /rentabilidade/, /fundo/, /cdb/]], ["Seguros", [/seguro/, /sinistro/, /apolice/]]];
    if (product === "Não Identificado") for (const [candidate, patterns] of productHints) if (has(text, patterns)) { product = taxonomyValue(taxonomy.products, candidate); productConfidence = 0.8; break; }
    const urgency = taxonomyValue(taxonomy.urgency, category === "Outros" ? "Baixa" : "Média");
    return applyDeterministicRules(complaint, taxonomy, { category: taxonomyValue(taxonomy.categories, category), product: taxonomyValue(taxonomy.products, product), urgency, confidence: { category: categoryConfidence, product: productConfidence, urgency: category === "Outros" ? 0.65 : 0.7, risk: 0.65 } });
  }

  close(): void {}
}
