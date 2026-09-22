#!/usr/bin/env node

import { resolve } from "node:path";

import { runV0 } from "../runner/v0.js";

function usage(): void {
  console.log("usage: v0.js run --input <csv> --output-dir <dir> --pack <pack.yaml> --mode mock|laya [--model-dir <dir>] [--model-revision <sha>] [--decision-prompt <json>] [--urgency-high-boundary <number>] [--product-policy model|source_if_known] [--option-order canonical|reverse|rotate|seed-17|seed-29] [--confidence-policy none|experimental]");
}

function readOptions(argumentsList: string[]): Record<string, string> {
  const options: Record<string, string> = {};
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (!argument.startsWith("--")) throw new Error(`unexpected argument: ${argument}`);
    const value = argumentsList[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing value for ${argument}`);
    options[argument.slice(2)] = value;
    index += 1;
  }
  return options;
}

const [command, ...argumentsList] = process.argv.slice(2);
if (!command || command === "--help" || command === "help") {
  usage();
  process.exit(0);
}
if (command !== "run") {
  usage();
  process.exit(2);
}

try {
  const options = readOptions(argumentsList);
  if (!options.input || !options["output-dir"] || !options.pack || !options.mode) {
    throw new Error("--input, --output-dir, --pack and --mode are required");
  }
  if (options.mode !== "mock" && options.mode !== "laya") throw new Error(`unsupported mode: ${options.mode}`);
  const result = await runV0({
    inputPath: resolve(options.input),
    outputDir: resolve(options["output-dir"]),
    packPath: resolve(options.pack),
    mode: options.mode,
    modelDir: options["model-dir"],
    modelRevision: options["model-revision"],
    decisionPromptPath: options["decision-prompt"],
    urgencyHighBoundary: options["urgency-high-boundary"] === undefined ? undefined : Number(options["urgency-high-boundary"]),
    productPolicy: options["product-policy"] as "model" | "source_if_known" | undefined,
    optionOrder: options["option-order"] as "canonical" | "reverse" | "rotate" | "seed-17" | "seed-29" | undefined,
    confidencePolicy: options["confidence-policy"] as "none" | "experimental" | undefined,
  });
  console.log(JSON.stringify({ status: "completed", runId: result.runId, outputDir: result.outputDir }));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
