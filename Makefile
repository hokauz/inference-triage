.PHONY: help install build test run-v0 run-mock benchmark-v0 benchmark-finguard check check-v0 check-structure check-contracts check-e2e-v0 check-compose-v0

CHECK := ./scripts/check
TS_RUNTIME := runtimes/typescript
V0_COMMAND := node $(TS_RUNTIME)/dist/src/commands/v0.js
PACK := assets/packs/finguard/pack.yaml
INPUT ?= checks/e2e/v0/fixtures/complaints.csv
OUTPUT_DIR ?= artifacts/local-v0

help:
	@printf '%s\n' 'Inference Triage checks:'
	@printf '%s\n' '  make install          Install TypeScript runtime dependencies (Bun)'
	@printf '%s\n' '  make build            Compile the TypeScript runtime'
	@printf '%s\n' '  make test             Run TypeScript unit/E2E tests'
	@printf '%s\n' '  make run-mock         Run local deterministic mock (INPUT=... OUTPUT_DIR=...)'
	@printf '%s\n' '  make benchmark-v0     Build and run the constrained Docker benchmark'
	@printf '%s\n' '  make benchmark-finguard  Run the constrained benchmark over the full local CSV'
	@printf '%s\n' '  make check-structure  Validate repository boundaries and directories'
	@printf '%s\n' '  make check-contracts   Validate V0 contracts, assets and fixtures'
	@printf '%s\n' '  make check-e2e-v0      Build and run the deterministic V0 E2E'
	@printf '%s\n' '  make check-v0          Run structure, contracts and V0 E2E'
	@printf '%s\n' '  make check             Alias for check-v0'
	@printf '%s\n' '  make check-compose-v0  Validate and run the constrained Docker Compose V0 profile'

install:
	cd $(TS_RUNTIME) && bun install --frozen-lockfile

build:
	cd $(TS_RUNTIME) && bun run build

test:
	cd $(TS_RUNTIME) && bun run test

run-v0: build
	mkdir -p $(OUTPUT_DIR)
	$(V0_COMMAND) run --input $(INPUT) --output-dir $(OUTPUT_DIR) --pack $(PACK) --mode mock

run-mock: run-v0

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
