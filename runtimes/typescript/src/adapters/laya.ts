import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { Laya } from "@receptron/laya";
import { Tokenizer } from "@huggingface/tokenizers";
import * as ort from "onnxruntime-node";

import { applyDeterministicRules } from "../core/rules.js";
import type { ChoiceQuestion, DecisionPrompt } from "../core/decision-prompt.js";
import type { DecisionModel, IngestedComplaint, Taxonomy } from "../core/types.js";

type LayaAnswer = Record<string, unknown>;
export interface MappedAnswer { value: string; confidence: number; probabilities: Record<string, number>; }

function answerRecord(value: unknown): LayaAnswer { return (value && typeof value === "object" ? value : {}) as LayaAnswer; }
function normalize(value: string): string { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
function probabilities(value: unknown): Record<string, number> {
  const record = answerRecord(value);
  return Object.fromEntries(Object.entries(record).filter(([, probability]) => typeof probability === "number" && Number.isFinite(probability) && probability >= 0 && probability <= 1)) as Record<string, number>;
}
export function rawScores(probabilityMap: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(probabilityMap).map(([key, value]) => [key, Math.log(Math.max(value, 1e-8))]));
}
export function mapChoice(answer: unknown, fallback: string): MappedAnswer {
  const record = answerRecord(answer);
  const validChoice = typeof record.choice === "string" && record.choice.length > 0;
  const value = validChoice ? record.choice as string : fallback;
  const distribution = probabilities(record.probabilities);
  return { value, confidence: validChoice ? distribution[value] ?? 0 : 0, probabilities: distribution };
}

export function mapTaxonomyChoice(answer: unknown, values: string[], fallback: string, minimumConfidence = 0): MappedAnswer {
  const mapped = mapChoice(answer, fallback);
  if (typeof answerRecord(answer).choice !== "string" || !answerRecord(answer).choice) return { value: fallback, confidence: 0, probabilities: mapped.probabilities };
  const selected = values.find((candidate) => normalize(candidate) === normalize(mapped.value));
  if (!selected) return { value: fallback, confidence: 0, probabilities: mapped.probabilities };
  if (mapped.confidence < minimumConfidence) {
    return { value: fallback, confidence: mapped.probabilities[fallback] ?? 0, probabilities: mapped.probabilities };
  }
  return { ...mapped, value: selected };
}

export function mapScore(answer: unknown, values: string[], highBoundary = 1.5): MappedAnswer & { score: number | null } {
  const record = answerRecord(answer);
  const rawScore = typeof record.score === "number" && Number.isFinite(record.score) ? record.score : null;
  const index = rawScore === null ? 0 : rawScore >= 2.5 ? 3 : rawScore >= highBoundary ? 2 : rawScore >= 0.5 ? 1 : 0;
  const distribution = probabilities(record.probabilities);
  return { value: values[index] ?? values[0], confidence: rawScore === null ? 0 : distribution[String(index)] ?? 0, probabilities: distribution, score: rawScore };
}

export async function resolveHierarchicalCategory(
  coarseAnswer: unknown,
  fineAnswer: () => Promise<unknown>,
  categories: string[],
): Promise<{ category: MappedAnswer; coarseProbabilities: Record<string, number> }> {
  const coarse = mapChoice(coarseAnswer, "Demais");
  if (coarse.value === "Fraude/Segurança" || coarse.value === "Cancelamento") {
    return { category: coarse, coarseProbabilities: coarse.probabilities };
  }
  return { category: mapTaxonomyChoice(await fineAnswer(), categories, "Outros"), coarseProbabilities: coarse.probabilities };
}

export function selectProduct(model: MappedAnswer, sourceProduct: string | null, products: string[], policy: "model" | "source_if_known"): MappedAnswer {
  const source = products.find((value) => value === sourceProduct && value !== "Não Identificado");
  return policy === "source_if_known" && source
    ? { ...model, value: source, confidence: model.confidence > 0 ? model.probabilities[source] ?? 0 : 0 }
    : model;
}

export function validateQuestionBudget(encode: (text: string) => number[], budget: number, name: string, question: { type: "choice" | "score"; instructions: string; criteria: Record<string, string> | string[] }): void {
  const options = Array.isArray(question.criteria)
    ? question.criteria.map((value, index) => `level ${index}: ${value}`)
    : Object.entries(question.criteria).map(([key, value]) => value ? `${key}: ${value}` : key);
  const head = encode(`${question.type} question: ${question.instructions}`).length;
  const optionLengths = options.map((value) => encode(` ${value}`).length + 1);
  if (optionLengths.some((length) => length > 49) || head + optionLengths.reduce((sum, length) => sum + length, 0) > budget) {
    throw new Error(`question ${name} exceeds head_max_len=${budget} without truncation`);
  }
}

export interface LayaAdapterOptions {
  modelDir: string;
  revision?: string;
  threads?: number;
  prompt: DecisionPrompt;
  taxonomy: Taxonomy;
  urgencyHighBoundary?: number;
  productPolicy?: "model" | "source_if_known";
}

export class LayaDecisionModel implements DecisionModel {
  readonly id = "laya-node-onnx-v1";
  private constructor(private readonly model: any, private readonly options: LayaAdapterOptions) {}

  static async load(options: LayaAdapterOptions): Promise<LayaDecisionModel> {
    const directory = resolve(options.modelDir);
    const tokenizerConfig = JSON.parse(readFileSync(join(directory, "tokenizer/tokenizer_config.json"), "utf8")) as Record<string, string>;
    let model: any;
    if (tokenizerConfig.cls_token === "[CLS]" && tokenizerConfig.sep_token === "[SEP]" && tokenizerConfig.mask_token === "[MASK]") {
      model = await Laya.load({ modelDir: directory, revision: options.revision, executionProviders: ["cpu"], sessionOptions: { intraOpNumThreads: options.threads ?? 1 } });
    } else {
      // @receptron/laya@0.1.2 hardcodes English special tokens in load(). Its
      // inference engine supports the multilingual tokenizer when given its IDs.
      const tokenizer = new Tokenizer(JSON.parse(readFileSync(join(directory, "tokenizer/tokenizer.json"), "utf8")), tokenizerConfig);
      const id = (token: string): number => {
        const value = tokenizer.token_to_id(token);
        if (value === undefined) throw new Error(`special token ${token} missing from tokenizer`);
        return value;
      };
      const ids = { cls: id(tokenizerConfig.cls_token), sep: id(tokenizerConfig.sep_token), mask: id(tokenizerConfig.mask_token), pad: id(tokenizerConfig.pad_token), maskTok: tokenizerConfig.mask_token };
      const config = JSON.parse(readFileSync(join(directory, "laya_config.json"), "utf8"));
      const session = await ort.InferenceSession.create(join(directory, "laya.onnx"), { executionProviders: ["cpu"], graphOptimizationLevel: "all", intraOpNumThreads: options.threads ?? 1 });
      model = new (Laya as any)(session, tokenizer, config, ids, directory);
    }
    const checkQuestion = (name: string, question: { type: "choice" | "score"; instructions: string; criteria: Record<string, string> | string[] }) => validateQuestionBudget(model.encode, model.config.head_max_len, name, question);
    const checkChoice = (name: string, source: ChoiceQuestion) => checkQuestion(name, { type: "choice", ...source });
    try {
      if (options.prompt.mode === "flat") checkChoice("category", options.prompt.category!);
      else { checkChoice("coarse", options.prompt.coarse!); checkChoice("fine", options.prompt.fine!); }
      checkQuestion("product", { type: "choice", instructions: options.prompt.product.instructions, criteria: Object.fromEntries(options.taxonomy.products.map((value) => [value, value])) });
      checkQuestion("urgency", { type: "score", instructions: options.prompt.urgency.instructions, criteria: options.taxonomy.urgency });
    } catch (error) {
      await model.close();
      throw error;
    }
    return new LayaDecisionModel(model, options);
  }

  async decide(complaint: IngestedComplaint, taxonomy: Taxonomy) {
    const startedAt = performance.now();
    const state = { channel: complaint.channel, sourceProduct: complaint.sourceProduct, body: complaint.rawText };
    const prompt = this.options.prompt;
    const questions = {
      ...(prompt.mode === "flat"
        ? { category: { type: "choice", ...prompt.category! } }
        : { coarse: { type: "choice", ...prompt.coarse! } }),
      product: { type: "choice", instructions: prompt.product.instructions, criteria: Object.fromEntries(taxonomy.products.map((value) => [value, value])) },
      urgency: { type: "score", instructions: prompt.urgency.instructions, criteria: taxonomy.urgency },
    };
    const first = answerRecord((await this.model.systemOne(state, questions)).answers);
    let category: MappedAnswer;
    let stageProbabilities: Record<string, number> | undefined;
    if (prompt.mode === "flat") {
      category = mapTaxonomyChoice(first.category, taxonomy.categories, "Outros");
    } else {
      const resolved = await resolveHierarchicalCategory(first.coarse, async () => {
        const second = answerRecord((await this.model.systemOne(state, { fine: { type: "choice", ...prompt.fine! } })).answers);
        return second.fine;
      }, taxonomy.categories);
      category = resolved.category;
      stageProbabilities = resolved.coarseProbabilities;
    }
    const modelProduct = mapTaxonomyChoice(first.product, taxonomy.products, taxonomy.products.at(-1) ?? "Não Identificado", 0.6);
    const product = selectProduct(modelProduct, complaint.sourceProduct, taxonomy.products, this.options.productPolicy ?? "model");
    const urgency = mapScore(first.urgency, taxonomy.urgency, this.options.urgencyHighBoundary ?? 1.5);
    const invalidModelAnswer = category.confidence === 0 || modelProduct.confidence === 0 || urgency.score === null;
    const decision = applyDeterministicRules(complaint, taxonomy, {
      category: category.value,
      product: product.value,
      urgency: urgency.value,
      confidence: { category: category.confidence, product: product.confidence, urgency: urgency.confidence, risk: 0.65 },
    });
    // Policy overrides are not probabilities. Keep the model probability of the
    // final urgency class; risk has no probabilistic model in this pipeline.
    decision.confidence.urgency = urgency.score === null ? 0 : urgency.probabilities[String(taxonomy.urgency.indexOf(decision.urgency))] ?? 0;
    decision.confidence.risk = 0;
    decision.confidenceStatus = invalidModelAnswer ? "invalid" : "probabilistic";
    decision.modelOutput = {
      ...decision.modelOutput!,
      categoryProbabilities: category.probabilities,
      categoryRawScores: rawScores(category.probabilities),
      categoryRawScoreKind: "log_probability",
      productProbabilities: product.probabilities,
      productRawScores: rawScores(product.probabilities),
      productRawScoreKind: "log_probability",
      productModelChoice: modelProduct.value,
      productRawChoice: typeof answerRecord(first.product).choice === "string" ? answerRecord(first.product).choice as string : undefined,
      urgencyProbabilities: urgency.probabilities,
      urgencyRawScores: rawScores(urgency.probabilities),
      urgencyRawScoreKind: "log_probability",
      urgencyScore: urgency.score ?? undefined,
      categoryStageProbabilities: stageProbabilities,
      confidenceStatus: invalidModelAnswer ? "invalid" : "probabilistic",
      confidenceStatusByField: {
        category: category.confidence === 0 ? "invalid" : "probabilistic",
        product: modelProduct.confidence === 0 ? "invalid" : "probabilistic",
        urgency: urgency.score === null ? "invalid" : "probabilistic",
        risk: "deterministic",
      },
      confidencePolicy: "none",
      sourceMetadataOverride: product.value !== modelProduct.value,
    };
    return { ...decision, decisionMs: Number((performance.now() - startedAt).toFixed(3)) };
  }

  async close(): Promise<void> { await this.model.close?.(); }
}
