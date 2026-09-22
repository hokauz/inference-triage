.PHONY: help install audit-deps build test run-v0 run-mock prepare-laya-model check-laya-model prepare-labels-v2 build-review-queue analyze-benchmark laya-smoke benchmark-v0 benchmark-finguard benchmark-laya laya-local-smoke benchmark-laya-local check check-v0 check-structure check-contracts check-e2e-v0 check-compose-v0

CHECK := ./scripts/check
TS_RUNTIME := runtimes/typescript
V0_COMMAND := node $(TS_RUNTIME)/dist/src/commands/v0.js
PACK := assets/packs/finguard/pack.yaml
INPUT ?= checks/e2e/v0/fixtures/complaints.csv
OUTPUT_DIR ?= artifacts/local-v0

help:
	@printf '%s\n' 'Inference Triage checks:'
	@printf '%s\n' '  make install          Install TypeScript runtime dependencies (Bun)'
	@printf '%s\n' '  make audit-deps       Scan runtime dependencies with Bun'
	@printf '%s\n' '  make build            Compile the TypeScript runtime'
	@printf '%s\n' '  make test             Run TypeScript unit/E2E tests'
	@printf '%s\n' '  make run-mock         Run local deterministic mock (INPUT=... OUTPUT_DIR=...)'
	@printf '%s\n' '  make benchmark-v0     Build and run the constrained Docker benchmark'
	@printf '%s\n' '  make benchmark-finguard  Run the constrained benchmark over the full local CSV'
	@printf '%s\n' '  make laya-smoke       Run Laya in Compose on the small fixture'
	@printf '%s\n' '  make benchmark-laya   Run the constrained benchmark over the full CSV with Laya'
	@printf '%s\n' '  make laya-local-smoke  Run the faster local Laya profile on the small fixture'
	@printf '%s\n' '  make benchmark-laya-local  Run the faster local Laya profile over the full CSV'
	@printf '%s\n' '  make prepare-laya-model  Download and validate the local ONNX bundle'
	@printf '%s\n' '  make check-laya-model   Validate the local ONNX bundle without downloading'
	@printf '%s\n' '  make analyze-benchmark  Compare AI draft labels with a benchmark JSONL'
	@printf '%s\n' '  make prepare-labels-v2  Rebuild draft labels with canonical source hashes'
	@printf '%s\n' '  make build-review-queue  Select difficult cases for controlled human review'
	@printf '%s\n' '  make check-structure  Validate repository boundaries and directories'
	@printf '%s\n' '  make check-contracts   Validate V0 contracts, assets and fixtures'
	@printf '%s\n' '  make check-e2e-v0      Build and run the deterministic V0 E2E'
	@printf '%s\n' '  make check-v0          Run structure, contracts and V0 E2E'
	@printf '%s\n' '  make check             Alias for check-v0'
	@printf '%s\n' '  make check-compose-v0  Validate and run the constrained Docker Compose V0 profile'

install:
	cd $(TS_RUNTIME) && bun install --frozen-lockfile

audit-deps:
	cd $(TS_RUNTIME) && bun pm scan

build:
	cd $(TS_RUNTIME) && bun run build

test:
	cd $(TS_RUNTIME) && bun run test

run-v0: build
	mkdir -p $(OUTPUT_DIR)
	$(V0_COMMAND) run --input $(INPUT) --output-dir $(OUTPUT_DIR) --pack $(PACK) --mode mock

run-mock: run-v0

prepare-laya-model: install
	LAYA_REVISION="$${LAYA_REVISION:-main}" LAYA_REPO="$${LAYA_REPO:-receptron/laya-onnx}" LAYA_SUBFOLDER="$${LAYA_SUBFOLDER:-}" node scripts/prepare-laya-model.mjs

check-laya-model:
	node scripts/prepare-laya-model.mjs --check

analyze-benchmark:
	node scripts/analyze-benchmark.mjs

prepare-labels-v2:
	node scripts/create-label-draft-v2.mjs

build-review-queue:
	node scripts/build-review-queue.mjs

laya-smoke:
	$(MAKE) check-laya-model
	docker compose -f compose/benchmarks/v0-laya/compose.yaml config
	mkdir -p artifacts/v0-laya
	docker compose -f compose/benchmarks/v0-laya/compose.yaml build v0
	docker compose -f compose/benchmarks/v0-laya/compose.yaml run --rm -v "$$(pwd)/checks/e2e/v0/fixtures:/inputs:ro" v0 run --input /inputs/complaints.csv --output-dir /outputs/smoke --pack assets/packs/finguard/pack.yaml --mode laya --model-dir /models/laya/multilingual
	test -f artifacts/v0-laya/smoke/benchmark_run.json

benchmark-v0: check-compose-v0

benchmark-finguard:
	docker compose -f compose/benchmarks/v0-finguard/compose.yaml config
	mkdir -p artifacts/v0-finguard
	docker compose -f compose/benchmarks/v0-finguard/compose.yaml build v0
	docker compose -f compose/benchmarks/v0-finguard/compose.yaml run --rm -e INFERENCE_TRIAGE_IMAGE_DIGEST="$$(docker image inspect --format '{{.Id}}' v0-finguard-v0:latest)" v0
	test -f artifacts/v0-finguard/full/benchmark_run.json
	test -f artifacts/v0-finguard/full/sample_executions.jsonl
	test -f artifacts/v0-finguard/full/ingestion_report.json
	test -f artifacts/v0-finguard/full/benchmark.sqlite

benchmark-laya:
	$(MAKE) check-laya-model
	docker compose -f compose/benchmarks/v0-laya/compose.yaml config
	mkdir -p artifacts/v0-laya
	docker compose -f compose/benchmarks/v0-laya/compose.yaml build v0
	docker compose -f compose/benchmarks/v0-laya/compose.yaml run --rm -e INFERENCE_TRIAGE_IMAGE_DIGEST="$$(docker image inspect --format '{{.Id}}' v0-laya-v0:latest)" -e LAYA_MODEL_REVISION="$${LAYA_MODEL_REVISION:-unknown}" -e LAYA_MODEL_HASH="$${LAYA_MODEL_HASH:-unknown}" v0
	test -f artifacts/v0-laya/full/benchmark_run.json
	test -f artifacts/v0-laya/full/sample_executions.jsonl
	test -f artifacts/v0-laya/full/ingestion_report.json
	test -f artifacts/v0-laya/full/benchmark.sqlite

laya-local-smoke:
	$(MAKE) check-laya-model
	docker compose -f compose/benchmarks/v0-laya-local/compose.yaml config
	mkdir -p artifacts/v0-laya-local
	docker compose -f compose/benchmarks/v0-laya-local/compose.yaml build v0
	docker compose -f compose/benchmarks/v0-laya-local/compose.yaml run --rm -v "$$(pwd)/checks/e2e/v0/fixtures:/inputs:ro" v0 run --input /inputs/complaints.csv --output-dir /outputs/smoke --pack assets/packs/finguard/pack.yaml --mode laya --model-dir /models/laya/multilingual
	test -f artifacts/v0-laya-local/smoke/benchmark_run.json

benchmark-laya-local:
	$(MAKE) check-laya-model
	docker compose -f compose/benchmarks/v0-laya-local/compose.yaml config
	mkdir -p artifacts/v0-laya-local
	docker compose -f compose/benchmarks/v0-laya-local/compose.yaml build v0
	docker compose -f compose/benchmarks/v0-laya-local/compose.yaml run --rm -e INFERENCE_TRIAGE_IMAGE_DIGEST="$$(docker image inspect --format '{{.Id}}' v0-laya-local-v0:latest)" -e LAYA_MODEL_REVISION="$${LAYA_MODEL_REVISION:-unknown}" -e LAYA_MODEL_HASH="$${LAYA_MODEL_HASH:-unknown}" v0
	test -f artifacts/v0-laya-local/full/benchmark_run.json
	test -f artifacts/v0-laya-local/full/sample_executions.jsonl
	test -f artifacts/v0-laya-local/full/ingestion_report.json
	test -f artifacts/v0-laya-local/full/benchmark.sqlite

check: check-v0

check-v0: check-structure check-contracts check-e2e-v0

check-structure:
	$(CHECK) structure

check-contracts:
	$(CHECK) contracts

check-e2e-v0:
	$(CHECK) e2e:v0

check-compose-v0:
	docker compose -f compose/benchmarks/v0-mock/compose.yaml config
	mkdir -p artifacts/v0-mock
	docker compose -f compose/benchmarks/v0-mock/compose.yaml build v0
	docker compose -f compose/benchmarks/v0-mock/compose.yaml run --rm -e INFERENCE_TRIAGE_IMAGE_DIGEST="$$(docker image inspect --format '{{.Id}}' v0-mock-v0:latest)" v0
	docker compose -f compose/benchmarks/v0-mock/compose.yaml run --rm -e INFERENCE_TRIAGE_IMAGE_DIGEST="$$(docker image inspect --format '{{.Id}}' v0-mock-v0:latest)" v0 run --input /inputs/security.csv --output-dir /outputs/security --pack assets/packs/finguard/pack.yaml --mode mock
	test -f artifacts/v0-mock/complaints/benchmark.sqlite
	test -f artifacts/v0-mock/security/benchmark.sqlite
