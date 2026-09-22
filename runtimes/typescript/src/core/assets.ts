import { createHash } from "node:crypto";
import { createReadStream, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { sha256 } from "./hashing.js";
import type { FinGuardPack, Taxonomy } from "./types.js";

function scalar(text: string, key: string): string {
  const match = text.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!match) throw new Error(`missing asset field: ${key}`);
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

function nestedScalar(text: string, key: string): string {
  const match = text.match(new RegExp(`^\\s{2}${key}:\\s*(.+)$`, "m"));
  if (!match) throw new Error(`missing nested asset field: ${key}`);
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

function resolveAsset(root: string, path: string): string {
  return resolve(root, path);
}

export function loadFinGuardPack(root: string, packPath: string): FinGuardPack {
  const content = readFileSync(packPath, "utf8");
  const policyMatch = content.match(/^\s{4}path:\s*(.+)$/m);
  if (!policyMatch) throw new Error("missing policy path in pack");

  return {
    id: scalar(content, "id"),
    version: scalar(content, "version"),
    taxonomyPath: resolveAsset(root, scalar(content, "taxonomy")),
    policyPath: resolveAsset(root, policyMatch[1].trim()),
    promptPaths: ["decision", "risk_review", "summary"].map((key) =>
      resolveAsset(root, nestedScalar(content, key)),
    ),
    decisionPromptPath: resolveAsset(root, nestedScalar(content, "decision")),
  };
}

export function loadTaxonomy(path: string): Taxonomy {
  const content = readFileSync(path, "utf8");
  const lists: Record<string, string[]> = {};
  let current: string | null = null;

  for (const line of content.split(/\r?\n/)) {
    const key = line.match(/^([a-z_]+):\s*$/);
    if (key) {
      current = key[1];
      lists[current] = [];
      continue;
    }
    const item = line.match(/^\s+-\s+(.+)$/);
    if (item && current) lists[current].push(item[1].trim());
  }

  const required = [
    "categories",
    "products",
    "sentiments",
    "urgency",
    "risk_levels",
    "channels",
    "statuses",
    "threat_types",
  ];
  for (const key of required) {
    if (!lists[key]?.length) throw new Error(`taxonomy is missing values for ${key}`);
  }

  return {
    version: scalar(content, "version"),
    categories: lists.categories,
    products: lists.products,
    sentiments: lists.sentiments,
    urgency: lists.urgency,
    riskLevels: lists.risk_levels,
    channels: lists.channels,
    statuses: lists.statuses,
    threatTypes: lists.threat_types,
  };
}

export function fileHash(path: string): string {
  return sha256(readFileSync(path));
}

export function promptHash(paths: string[]): string {
  return sha256(paths.map((path) => readFileSync(path, "utf8")).join("\n---\n"));
}

export async function modelBundleHash(directory: string): Promise<string> {
  const hash = createHash("sha256");
  const visit = async (path: string, relative: string): Promise<void> => {
    const stat = statSync(path);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path).sort()) await visit(`${path}/${entry}`, `${relative}/${entry}`);
      return;
    }
    hash.update(relative);
    for await (const chunk of createReadStream(path)) hash.update(chunk);
  };
  await visit(directory, "");
  return hash.digest("hex");
}
