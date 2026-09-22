#!/usr/bin/env node

import { createHash } from "node:crypto";
import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { dirname, resolve } from "node:path";

import { BUNDLE_FILES, ensureBundle } from "../runtimes/typescript/node_modules/@receptron/laya/dist/download.js";

const root = resolve(import.meta.dirname, "..");
const targetDir = resolve(root, process.env.LAYA_MODEL_DIR ?? "models/laya/multilingual");
const manifestPath = resolve(root, "models/laya/manifest.json");
const revision = process.env.LAYA_REVISION ?? "main";
const repo = process.env.LAYA_REPO ?? "receptron/laya-onnx";
const subfolder = process.env.LAYA_SUBFOLDER ?? "";
const cacheDir = process.env.LAYA_CACHE_DIR ?? "/tmp/inference-triage-laya-cache";
const checkOnly = process.argv.includes("--check");

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function fileInfo(relativePath) {
  const path = resolve(targetDir, relativePath);
  let size;
  try {
    size = (await stat(path)).size;
  } catch {
    throw new Error(`missing Laya bundle file: ${path}`);
  }
  if (size <= 0) throw new Error(`empty Laya bundle file: ${path}`);
  return { sha256: await sha256(path), size };
}

async function verify() {
  const files = {};
  for (const file of BUNDLE_FILES) files[file] = await fileInfo(file);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    throw new Error(`missing or invalid Laya manifest: ${manifestPath}`);
  }
  for (const [file, info] of Object.entries(files)) {
    const expected = manifest.files?.[file];
    if (expected?.sha256 && expected.sha256 !== info.sha256) throw new Error(`hash mismatch for ${file}`);
    if (expected?.size && expected.size !== info.size) throw new Error(`size mismatch for ${file}`);
  }
  console.log(JSON.stringify({ status: "ready", targetDir, revision: manifest.revision ?? null, files }, null, 2));
}

async function prepare() {
  const sourceDir = await ensureBundle({
    repo,
    subfolder,
    revision,
    cacheDir,
    onProgress: ({ file, received, total }) => {
      const suffix = total ? `/${total}` : "";
      process.stdout.write(`\r${file}: ${received}${suffix} bytes`);
    },
  });
  process.stdout.write("\n");
  await mkdir(targetDir, { recursive: true });
  for (const file of BUNDLE_FILES) {
    const destination = resolve(targetDir, file);
    await mkdir(dirname(destination), { recursive: true });
    await cp(resolve(sourceDir, file), destination);
  }
  const files = {};
  for (const file of BUNDLE_FILES) files[file] = await fileInfo(file);
  await writeFile(manifestPath, `${JSON.stringify({ model: "laya", variant: subfolder || "root", source: repo, subfolder: subfolder || null, revision, status: "ready", files }, null, 2)}\n`);
  console.log(JSON.stringify({ status: "prepared", targetDir, manifestPath, revision, files }, null, 2));
}

try {
  if (checkOnly) await verify();
  else await prepare();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
