# Runtimes

Each runtime owns its own implementation of `core`, `runner`, `composer`, and
adapters. Runtimes communicate through versioned assets, platform contracts,
and persisted data—not by importing one another's source code.
