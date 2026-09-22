#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
source_dir=/private/tmp/inference-triage-multilingual-source
base_dir=/private/tmp/inference-triage-laya-base
output_dir="$root/models/laya/multilingual-onnx"

mkdir -p "$source_dir" "$base_dir" "$output_dir"
docker build -f "$root/compose/export-laya-multilingual/Dockerfile" -t inference-triage-laya-export:20260922 "$root/compose/export-laya-multilingual"
docker run --rm \
  --mount "type=bind,source=$source_dir,target=/work/model" \
  --mount "type=bind,source=$base_dir,target=/work/base" \
  --mount "type=bind,source=$root/scripts/download-laya-multilingual.py,target=/work/download.py,readonly" \
  inference-triage-laya-export:20260922 python /work/download.py
docker run --rm \
  --mount "type=bind,source=$source_dir,target=/work/model,readonly" \
  --mount "type=bind,source=$base_dir,target=/work/base,readonly" \
  --mount "type=bind,source=$root/scripts/export-laya-multilingual.py,target=/work/export.py,readonly" \
  --mount "type=bind,source=$output_dir,target=/work/out" \
  -e PYTHONPATH=/work/base \
  inference-triage-laya-export:20260922 python /work/export.py /work/model /work/out
