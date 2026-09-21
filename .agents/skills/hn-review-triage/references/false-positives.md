# False Positive Patterns — Mirumo

Reference for `hn-review-triage`. Read when a finding sounds plausible but may not survive code inspection.

## API (`apps/api`)

| Reviewer claim | Often false when… |
| -------------- | ----------------- |
| "Business logic in handler" | Handler only maps status/body and delegates; logic lives in `service.ts`. |
| "Missing validation" | `schema.ts` + Elysia `t` models already validate at the route boundary. |
| "Should use shared util" | Pattern appears once; extraction would be premature abstraction. |
| "Service sets HTTP status" | Service returns domain errors; handler owns `set.status` / `status()`. |
| "Repository should return DTO" | Repo returns DB shapes; mapping belongs in service or is schema-derived. |
| "Import schema in service" | Types should flow through `model.ts`, not direct `schema.ts` imports — reviewer may flag the wrong import path. |
| "Numeric coercion missing" | Check if Postgres column is already `integer`/`double` or coercion exists in repo. |

## Web (`apps/web`)

| Reviewer claim | Often false when… |
| -------------- | ----------------- |
| "Missing React.memo" | Mirumo does not memo everything by default; need profiling evidence. |
| "Rules of Hooks violation" | Custom hook or early return is after all hooks; reviewer misread nesting. |
| "Should use Server Components" | Mirumo is Vite SPA — RSC guidance does not apply. |
| "Missing error boundary" | Error state handled inline or via route-level pattern already in module. |
| "useEffect is wrong" | Effect syncs with external system (auth, subscription); not derivable state. |
| "Should use interface not type" | `type` is correct for unions, schema-derived aliases, or utility compositions. |
| "Test uses getByTestId" | Acceptable when role queries are ambiguous; check module test conventions. |

## Database & infra

| Reviewer claim | Often false when… |
| -------------- | ----------------- |
| "Migration not synced" | Change is only in `packages/db`; `make db-sync` is a workflow step, not a PR defect. |
| "Seed data wrong" | Seeds are curated snapshots; reviewer compares against local dev dump. |
| "Missing index" | Query is low volume or PK/FK already covers the access pattern. |

## Tests & CI

| Reviewer claim | Often false when… |
| -------------- | ----------------- |
| "Needs e2e for this unit change" | Behavior is covered by unit tests; e2e would duplicate without new user journey. |
| "Flaky test" | Failure is env/infra (Supabase not up) not the test itself — verify reproduction. |
| "Missing test" | Change is type-only, re-export, or docs with no behavior delta. |

## Review meta-noise

| Pattern | Triage |
| ------- | ------ |
| Suggests rewrite to different framework | Out of scope unless ADR or task requires it. |
| Quotes AGENTS.md rule that contradicts `CLAUDE.md` or actual codebase | Verify which doc matches practice; cite real files. |
| "Everyone knows you should…" without code reference | Inconclusive until traced. |
| Duplicate comments on same hunk | Stale or Partially valid — merge into one verdict. |
| AI-generated review with generic security boilerplate | Verify each claim; bulk dismiss only with per-item evidence. |

## Evidence shortcuts

Use these before deep dives:

```bash
# Locate symbol referenced in review
rg -n "<symbol>" apps/api apps/web packages

# See what the branch actually changed
git diff main...HEAD --stat
git diff main...HEAD -- <path>

# Targeted API test
cd apps/api && bun test <path>

# Targeted web test
cd apps/web && bunx vitest run <path>
```
