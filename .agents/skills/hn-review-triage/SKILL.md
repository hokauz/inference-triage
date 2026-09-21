---
name: hn-review-triage
description: >-
  Triage code review feedback by verifying each finding against the actual
  diff and codebase. Classifies items as valid, partially valid, false positive,
  out of scope, or stale. Use when the user provides a review, PR comments,
  evaluation, or asks which feedback is real vs noise.
---

# Review Triage

Use this skill when the user supplies a review, evaluation, or list of findings and wants to know what is **relevant/real** vs **false positive**.

Communicate the final triage to the user in **Portuguese**. Keep finding titles and evidence citations in English when they reference code.

## Workflow

1. **Normalize input** — Split the review into atomic findings (one concern per item). Preserve the reviewer's exact wording as the finding title.
2. **Gather context** — Read the relevant diff, touched files, and surrounding code. If the review references behavior, trace the call path. Run targeted checks only when a claim is falsifiable (tests, types, grep).
3. **Verify each finding** — For every item, collect concrete evidence: file paths, line ranges, diff hunks, or command output that supports or refutes the claim.
4. **Classify** — Assign exactly one verdict per finding (see taxonomy below).
5. **Prioritize** — Order valid findings by severity and actionability. Drop or deprioritize false positives unless the user asked for a full inventory.
6. **Respond** — Use the output template. Be explicit about _why_ each false positive was rejected.

Do not accept a finding at face value. Do not dismiss a finding without reading the code it references.

## Verdict taxonomy

| Verdict             | When to use                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Valid**           | The concern is factually correct in the current code and matters for correctness, security, maintainability, or project conventions.                  |
| **Partially valid** | The underlying issue exists but severity, scope, or framing is overstated; or it applies only under specific conditions the reviewer did not mention. |
| **False positive**  | The claim is incorrect, already handled, or based on a misread of the code, framework, or project conventions.                                        |
| **Out of scope**    | Factually true but not introduced or affected by the change under review (pre-existing, unrelated module, hypothetical future risk).                  |
| **Stale**           | Was valid on an earlier revision but the current diff already addresses it.                                                                           |

## Verification checklist

For each finding, answer these before classifying:

- [ ] Did I read the exact file/function the reviewer cited (not just the diff summary)?
- [ ] Does the concern apply to **new or changed** code, or only to pre-existing code?
- [ ] Does Mirumo have an established convention that already covers this case? Check `AGENTS.md`, `CLAUDE.md`, and module `AGENTS.md` when relevant.
- [ ] Is the reviewer applying a generic rule that conflicts with an intentional local pattern?
- [ ] If the claim is about runtime behavior, can I trace the code path or point to a test that proves/disproves it?
- [ ] If the claim is about missing tests, is the gap real and meaningful for this change?

## False-positive heuristics

Treat as **likely false positive** when:

- The reviewer misidentifies the layer (handler vs service vs repository, component vs hook).
- The concern assumes a bug that cannot happen given types, validation, or guards already in place.
- The suggestion duplicates an existing abstraction the reviewer did not see.
- The finding criticizes style that matches prevailing patterns in the same module.
- The reviewer recommends a large refactor for a change that is intentionally minimal in scope.
- The comment targets generated, synced, or third-party code the PR did not author.

Treat as **likely out of scope** when:

- The issue predates the branch and the diff does not touch that code.
- The finding requests unrelated cleanup ("while you're here…") with no coupling to the change.

Treat as **likely stale** when:

- The diff after the comment already implements the suggested fix.
- The reviewer quoted old line numbers or removed code.

For extended patterns and Mirumo-specific examples, see [references/false-positives.md](references/false-positives.md).

## Severity (valid findings only)

- **Blocker** — Correctness bug, security issue, data loss, or broken contract.
- **Should fix** — Real maintainability or convention violation worth addressing before merge.
- **Consider** — Reasonable improvement with trade-offs; author's call.
- **Nit** — Style or preference; valid but low impact.

## Output template

```markdown
## Resumo

<1–2 frases: quantos achados são válidos, quantos são ruído, e recomendação geral>

## Achados válidos

### [Blocker|Should fix|Consider|Nit] — <título do achado>

- **Veredito:** Valid | Partially valid
- **Por quê:** <evidência concreta com referência ao código>
- **Ação sugerida:** <o que fazer, se aplicável>

## Falsos positivos e ruído

### <título do achado>

- **Veredito:** False positive | Out of scope | Stale
- **Por quê:** <evidência que refuta ou contextualiza o comentário>

## Prioridade de ação

1. <primeira ação concreta>
2. <segunda ação>
   …

## Lacunas

<itens que não foi possível verificar sem mais contexto, runtime, ou CI>
```

## Rules

1. Every verdict must cite evidence — never classify by vibe or authority of the reviewer.
2. Prefer **Partially valid** over binary dismissal when the core observation is right but the conclusion is wrong.
3. When unsure, say **inconclusive** and state what evidence is missing; do not guess.
4. Do not rewrite code unless the user asks; this skill triages feedback, it does not implement fixes.
5. If the review mixes several concerns in one paragraph, split them before classifying.
6. When the review references CI or e2e failures, verify with logs or reproduce locally before marking Valid.
7. When reviewing commits or PR descriptions, a missing **Why** section on a product or business-rule change is **Consider** (not Blocker) — suggest adding intent via the `hn-commit` skill.
