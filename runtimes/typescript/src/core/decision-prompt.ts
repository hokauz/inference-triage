import { readFileSync } from "node:fs";

import type { Taxonomy } from "./types.js";

export interface ChoiceQuestion { instructions: string; criteria: Record<string, string>; }
export interface DecisionPrompt {
  version: string;
  mode: "flat" | "hierarchical";
  category?: ChoiceQuestion;
  coarse?: ChoiceQuestion;
  fine?: ChoiceQuestion;
  product: { instructions: string };
  urgency: { instructions: string };
}

export type OptionOrder = "canonical" | "reverse" | "rotate" | "seed-17" | "seed-29";

function reorderCriteria(criteria: Record<string, string>, order: OptionOrder): Record<string, string> {
  const entries = Object.entries(criteria);
  if (order === "canonical") return Object.fromEntries(entries);
  if (order === "reverse") return Object.fromEntries(entries.reverse());
  if (order === "rotate") return Object.fromEntries(entries.length ? [...entries.slice(1), entries[0]] : entries);
  let state = order === "seed-17" ? 17 : 29;
  const shuffled = [...entries];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    const swap = state % (index + 1);
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return Object.fromEntries(shuffled);
}

export function reorderDecisionPrompt(prompt: DecisionPrompt, order: OptionOrder): DecisionPrompt {
  if (order === "canonical") return prompt;
  const choice = (question?: ChoiceQuestion) => question ? { ...question, criteria: reorderCriteria(question.criteria, order) } : question;
  return { ...prompt, category: choice(prompt.category), coarse: choice(prompt.coarse), fine: choice(prompt.fine) };
}

export function loadDecisionPrompt(path: string, taxonomy: Taxonomy): DecisionPrompt {
  const prompt = JSON.parse(readFileSync(path, "utf8")) as DecisionPrompt;
  if (!prompt.version || !["flat", "hierarchical"].includes(prompt.mode)) throw new Error("invalid decision prompt version or mode");
  if (!prompt.product?.instructions || !prompt.urgency?.instructions) throw new Error("decision prompt requires product and urgency instructions");
  const questions = prompt.mode === "flat" ? [prompt.category] : [prompt.coarse, prompt.fine];
  if (questions.some((question) => !question?.instructions || !question.criteria || !Object.keys(question.criteria).length)) throw new Error("invalid category questions");
  const labels = prompt.mode === "flat"
    ? Object.keys(prompt.category!.criteria)
    : [...Object.keys(prompt.coarse!.criteria).filter((key) => key !== "Demais"), ...Object.keys(prompt.fine!.criteria)];
  if (labels.length !== taxonomy.categories.length || new Set(labels).size !== labels.length || labels.some((label) => !taxonomy.categories.includes(label))) {
    throw new Error("decision prompt categories do not match active taxonomy");
  }
  if (prompt.mode === "hierarchical" && !Object.hasOwn(prompt.coarse!.criteria, "Demais")) throw new Error("hierarchical prompt requires Demais branch");
  return prompt;
}
