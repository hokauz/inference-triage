---
name: hn-commit
description: >-
  Generate ready-to-paste Conventional Commit messages from staged git changes
  using the repository's local commit patterns, a required domain-first scope,
  and a structured body with mandatory Why (intent/decision). Use when the user
  asks for a commit message, PR message, mensagem de commit, or wants a message
  prepared from the current staged diff.
---

# Commit Message

Use this skill when the user needs a commit message for the current staged changes.

## Workflow

1. Inspect the staged diff first:
   - `git diff --cached --stat`
   - `git diff --cached --name-only`
   - `git diff --cached`
2. Check recent commits for local naming and scope patterns:
   - `git log --oneline -n 15`
3. Read validation evidence when available:
   - `artifacts/reports/validation/state.json`
   - populated by `bun run validate:*` scripts or `bun run review`, not by plain `bun run lint`
   - optionally run `bash scripts/validate-read.sh` for a human-readable summary
   - recompute the current staged fingerprint from `git rev-parse HEAD` plus `git diff --cached`
   - include only checks whose latest successful run matches the current staged fingerprint
4. Choose the smallest accurate `type` and a **required** `scope` using the scope catalog below.
5. Infer **Why** (mandatory). Infer Expected / Measure only when the diff or conversation supports them.
6. **Why confirmation gate:**
   - If Why is already known from the current thread, a linked issue/task/PR, or an explicit user approval of a prior suggestion → skip confirmation and write the English commit body.
   - If Why is missing or genuinely ambiguous → call **AskQuestion** (see below). Do not paste the commit body until the user answers.
   - Do not re-ask in chat when Why was already stated earlier in the same thread.

## Conventional Commits format

```text
<type>(<scope>): <short description>
```

- `type`: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`
- `scope`: **required** — see scope catalog below
- `description`: imperative, lowercase, no trailing period
- keep the subject line under ~72 characters

## Scope catalog (required)

Prefer a **domain** scope when the change is about one feature, even across `api`, `web`, and `e2e`.

**Domain** (business modules): `accounts`, `acl`, `auth`, `categories`, `creditcards`, `currencies`, `dashboard`, `goals`, `invoices`, `obligations`, `plans`, `subscriptions`, `transactions`, `waitlist`

**Workspace** (app-wide, not a single domain): `api`, `web`, `site`, `admin`, `ui`, `db`

**Tooling** (repo infrastructure): `ci`, `e2e`, `policies`, `skills`, `deps`, `infra`, `review`

Scope rules:

- Scope is required except for merge commits.
- Prefer domain over workspace. A plans UI change is `plans`, not `web`.
- One scope only. Cross-app work on the same domain keeps that domain scope.
- Do not invent scopes (`month`, `wip`, `transaction-table`). Map to the catalog.
- Use workspace or tooling only when no single domain owns the change.

## Why inference

Answer, in this order:

1. **Why** was this done? (required — decision/intent)
2. What **result** is expected? (optional)
3. How will it be **measured**? (optional)

Infer Why from: user wording, linked issue/task, then the staged diff.
Never invent a metric. Omit Expected and Measure when unknown.
If Why is ambiguous, offer one primary suggestion and up to two alternatives via AskQuestion;
do not paste a commit body until the user selects or supplies Why.

Skip AskQuestion when Why is already explicit in the conversation or linked work item.

## Output structure

```text
<type>(<scope>): <short description>

Why

<mandatory intent/decision in 1–2 sentences>
Expected: <optional; omit this line when unknown>
Measure: <optional; omit this line when unknown>

Summary

<1–2 sentences describing what the change does.>

Issues / tasks

<include only when the work is tied to tracked items. One reference per line. Omit the whole section when there are none.>
- <issue ID or URL>
- <issue ID or URL>

Changes

<one bullet per meaningful change>
- <change 1>
- <change 2>

Notes

<optional caveats, migrations, breaking changes, or follow-up work>

Validation

<optional commands or checks used to validate the change>
```

## Why confirmation (AskQuestion)

When Why is not already known, use the native **AskQuestion** tool — not free-form chat — to confirm intent.

Prompt (Portuguese), include scope context:

```text
Scope: `<scope>` — <one-line rationale>

Qual o motivo (Why) deste commit?
```

Options (2–4 total):

1. **Primary inferred Why** — mark as `(Recommended)` when it is the best match.
2. **Alternative Why** — include up to two when genuinely plausible.
3. **Other** — always available so the user can type a custom Why.

Rules for AskQuestion:

- Write option labels in Portuguese; keep each label concise (one sentence).
- Put the strongest inferred Why first and tag it `(Recommended)`.
- Always include **Other** for a custom Why.
- After the user answers, map the selection to the English `Why` section in the commit body.
- If the user picks **Other**, use their custom text as Why (translate to English in the commit body if they wrote in Portuguese).
- Do not ask again in chat after AskQuestion — one round is enough unless the answer is still empty.

After confirmation (or when Why was already known), return only the English ready-to-paste commit body.

## Rules

1. Scope is required. Prefer a domain scope over workspace when the change belongs to one feature.
2. **Why** is mandatory in the commit body. Expected and Measure are optional and must be grounded in evidence.
3. Keep Why focused on intent/decision. Do not repeat the Changes list or use marketing language.
4. If the staged diff is mostly mechanical, choose `refactor`, `style`, `test`, or `chore` instead of overstating the impact.
5. Include an `Issues / tasks` section only when there is an explicit linked issue, ticket, or task reference in the work.
6. Keep Summary and Changes factual and concise. Do not add implementation details that are not reflected in the diff.
7. Build the `Validation` section from `artifacts/reports/validation/state.json` when it exists. Include only checks with `exit_code === 0` that are still valid for the current staged diff. Format each line as `- <command> (pass, <timestamp>, matches staged diff)`. Omit stale or missing checks instead of inventing commands. If no valid checks exist, omit the whole `Validation` section.
8. If there are no staged changes, say so plainly and stop.
9. Write the commit body in English. Use Portuguese only in the AskQuestion prompt and option labels.
10. Prefer **AskQuestion** for Why confirmation. Skip it when Why is already known from the thread or linked work.
