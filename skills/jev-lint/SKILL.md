---
name: jev-lint
description: Use when running this custom-rule-only jev-lint fork, authoring natural-language rules, calibrating thresholds, or using explicit Cloudflare AI Gateway inference.
---

# jev-lint

This fork ships no production rules.
The generic engine matches AST nodes, text blocks or git changes and asks a model the supplied rule's question.
A finding is a human-review candidate, not authorization for consequential actions.
Never write a rule a compiler, type checker or conventional linter already decides.

## Explicit execution

1. Select user-authored rule files or a directory explicitly with `-R`.
2. Select an explicit job config with `--config`, or use `--no-config` and explicit target paths.
3. Run `check --dry-run --show-subjects --cache none` before inference and confirm rules and targets.
4. For Gateway inference pin `--transport cloudflare --model typesafe/jev`, or the same config fields, and check credential presence without displaying values.
5. If account, Gateway or inference permissions are unavailable, stop at that boundary rather than falling back to direct Typesafe.
6. Read findings against the supplied evidence and report missing judgments separately.

```bash
jev-lint check --no-config -R /path/to/custom-rules /path/to/targets --dry-run --cache none
jev-lint check --config /path/to/job.yml -R /path/to/custom-rules --transport cloudflare --model typesafe/jev --json
```

`--no-config` alone does not prevent `.jev-lint/rules/` discovery, so isolated documentation jobs must also pass `-R`.
`init` writes `rules: {}` and does not enable deleted upstream packs.
`rules --json` can correctly return an empty list, while a check without usable custom rules exits 2.

Gateway requires `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_GATEWAY_ID` and `CLOUDFLARE_AI_GATEWAY_API_KEY` in the environment.
It uses the fixed Workers AI universal endpoint, not direct Typesafe or an OpenAI chat endpoint.
Credentials never belong in configuration, rule files or reports.
The CLI and runner default to Cloudflare. Direct Typesafe requires explicit selection; only the low-level `Jev` SDK constructor retains a direct compatibility default.

## Authoring

- [Project authoring](references/writing-project-rules.md): custom rule layouts and evidence.
- [Cookbook](references/cookbook.md): independent examples, not installed rules.
- [Fields](references/rule-fields.md): generic rule fields and state arms.
- [Calibration](references/calibration.md): labeled defects, hard cleans, fitted cutoffs and accepted baselines.
- [Custom-only selection](references/using-shipped-rules.md): replacement for the upstream pack-selection guide.
- [Maintained reference](../../docs/reference.md): current CLI and Gateway contracts.

Only claim a rule works after its matcher reaches labeled subjects and its cutoff separates defects from hard clean cases across recorded answers.
A question that cannot be answered from the supplied state needs better evidence, not a guessed cutoff.
External context contents, full source state, selected model and route participate in cache scope.
Gateway caching is best-effort and does not guarantee independent samples or exactly-once execution.
