.PHONY: help check check-v0 check-structure check-contracts check-e2e-v0

CHECK := ./scripts/check

help:
	@printf '%s\n' 'Inference Triage checks:'
	@printf '%s\n' '  make check-structure  Validate repository boundaries and directories'
	@printf '%s\n' '  make check-contracts   Validate V0 contracts, assets and fixtures'
	@printf '%s\n' '  make check-e2e-v0      Run V0 E2E (requires V0_COMMAND)'
	@printf '%s\n' '  make check-v0          Run structure, contracts and V0 E2E'
	@printf '%s\n' '  make check             Alias for check-v0'

check: check-v0

check-v0: check-structure check-contracts check-e2e-v0

check-structure:
	$(CHECK) structure

check-contracts:
	$(CHECK) contracts

check-e2e-v0:
	$(CHECK) e2e:v0
