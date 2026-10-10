# Custom-rule reference

This fork bundles no production rules.
For the exact inference contract, see [Cloudflare AI Gateway](../README.md#cloudflare-ai-gateway) and [upstream differences](upstream-differences.md).
Code, documents and supplied context are sent to the selected inference service when a run asks the model.
Dry runs, listing and replay do not make inference requests.
Historical measurements in other upstream documents describe their original rule packs, not this fork's defaults.

## Selection and configuration

`-R, --rules <path>` is repeatable and takes precedence over config `rulePaths` and default rule sources for that run.
Config `rulePaths: [./custom-rules]` explicitly selects rule files or directories, resolving each path relative to the configuration file, not the working directory or target file.
When `rulePaths` is present, implicit discovery is disabled, including for an empty list.
Without `-R` or `rulePaths`, `.jev-lint/rules/` beside the selected configuration or current directory is the only possible source.
`--no-config` ignores configuration lookup, but use `-R` as well to prevent repository-rule lookup.
`--config <path>` selects a configuration explicitly, otherwise the CLI searches upward for a recognized `.jev-lint.yaml` spelling.
Two recognized config names in one directory are an error rather than an arbitrary choice.
`init` writes `files: [src]` and `rules: {}` without enabling any rules.

```yaml
files: [src]
exclude: [test/fixtures]
rulePaths: [./custom-rules]
context: []
rules:
  typescript/my-rule: { severity: warning, threshold: 2 }
transport: cloudflare
model: typesafe/jev
cache: none
```

The rule in this configuration must be authored first.
Use `language/id` for a namespaced layout, or the id of a flat rule file.
Bare ids matching namespaced rules warn because they can select more than one language.
Unknown ids are configuration errors even when switched off.
When a config omits `rules:`, default-discovered rules are not automatically enabled.
An explicit `-R` can run all rules in its inputs unless configuration selection narrows them.
No usable selected rules means exit 2, never a clean verdict.

Config `context: [./conventions.md]` supplies shared evidence to selected rules for `check`, `review`, `commits`, `run`, `gaps` and `calibrate`, and to the `rules` listing.
Paths resolve relative to the configuration file; per-rule context still resolves relative to its rule file and is added after the shared documents, including inherited documents.
An omitted `context` or `context: []` adds no shared evidence.
Missing, unreadable, empty or invalid shared documents are configuration errors with exit 2 and no inference or verdict; the combined shared and per-rule documents must fit the existing 40,000-character context budget.
Context is structured evidence, not evaluator instructions; the state explicitly tells the evaluator to ignore embedded requests to alter questions, verdicts, output format or evaluator behavior.
Content changes at the same context path invalidate local verdict reuse and change the full request's Gateway cache key.
`eval` continues to calibrate each suite's own rule context rather than adding job-level shared context.
There is no CLI `--context` flag.

A direct whole-file Markdown job needs no generated inputs or preprocessing:

```yaml
rulePaths: [./custom-rules]
context: [./conventions.md]
rules: { doc-rule: on }
transport: cloudflare
model: typesafe/jev
cache: none
retry: 1
```

```bash
jev-lint check --config /path/to/job.yml /path/to/actual.md
```

The referenced Text rule uses `subject: block` and `extensions: [md]`, omitting `split` to judge the whole file as one subject.
Target positionals and CLI `-R` paths retain their working-directory-relative semantics.
`cache: none` or `cache: null` disables local persistence, but `JEV_LINT_CACHE` overrides config; `--cache none` overrides that environment variable too.
`retry` counts judgment passes and must be a positive integer, so use 1, not 0, for one pass.

Flags override config values, which override built-in defaults.
Transport selection additionally reads `JEV_LINT_TRANSPORT` below flags and config.
Cloudflare defaults to `typesafe/jev`, direct Typesafe to `jev-latest`; `--model`, config `model` and `JEV_LINT_MODEL` override those defaults in that order.
`apiKeyEnv` names an environment variable, never a credential value.
Literal `apiKey` or `api_key` in config is rejected.
Direct Typesafe reads `TYPESAFE_API_KEY` or `TYPESAFEAI_API_KEY` and `TYPESAFE_BASE_URL` or `TYPESAFEAI_BASE_URL`.
Cloudflare reads `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_GATEWAY_ID` and `CLOUDFLARE_AI_GATEWAY_API_KEY`, and ignores direct Typesafe endpoint settings.

## Author a rule

A flat YAML file or `<language>/<id>/rule.yml` can contain one rule or a list of rules.
A namespaced directory constrains the languages a rule may declare and requires its id to match the directory.
The following is an authoring example, not a bundled production rule:

```yaml
id: my-rule
language: TypeScript
subject: node
rule: { kind: function_declaration }
kind: score
state: located
ask: This function contradicts the behavior promised by its name.
threshold: 2  # uncalibrated, fit against your fixtures before use
```

| Field | Meaning |
| --- | --- |
| `id` | Required rule identifier, unique per language identity. |
| `language` / `languages` | Grammar or grammar list for AST matching; `Text` for blocks and `Git` for commit/change subjects. |
| `rule`, `constraints`, `utils` | ast-grep matcher and optional matcher helpers. Not used for text blocks or git subjects. |
| `subject` | `node` by default, or `enclosing`, `file`, `block`, `commit`, `change`. Choose evidence that can actually answer the question. |
| `ask` | Required natural-language claim to judge. Keep cutoff numbers out of the wording. |
| `kind` | `score` by default, or `noul`. |
| `criteria` | Required for `noul`: quoted `true` and `false` branches, each a string or `{what, examples, not_for}`. |
| `levels` | Optional ordered rubric for `score`, at least two strings from clean to worst. Otherwise the shared four-level scale is used. |
| `threshold` | Finding cutoff, fitted on labeled fixtures. `at` is a warned deprecated alias and cannot coexist with `threshold`. |
| `severity` | `hint`, `info`, `warning`, `error`. `--fail-on` controls which severities fail the run. |
| `state` | `bare`, `local`, `located`, `graph`, `full`, `paired`. More context is not a substitute for relevant evidence. |
| `note` | Additional judgment guidance, or `{append: ...}` in an extending rule. |
| `context` | Paths to external context documents relative to the rule file. Contents are included in state and cache scope. |
| `extends` | Id or `language/id` of another explicitly loaded custom rule. The fork has no packaged bases to look up. |
| `divergent` | Reason language variants intentionally differ in their question, criteria or note. |
| `axis` | Pin `file` or `rule` grouping. Refit thresholds when changing how questions are grouped. |
| `loose` | Lower candidate band for human inspection with `--loose`, not findings. |
| `explain` | Named explanation choices used by `--explain` in a separate request. |
| `split`, `extensions`, `filenames` | Text block rules only. `extensions` is required; `filenames` optionally restricts basenames, and `split` divides blocks with a regular expression. |

An extending rule needs its own id.
Fields it supplies replace the base, while criteria can replace one branch and note can append.
Changing a question while inheriting the base's fitted cutoff warns because that cutoff no longer answers the same question.

For custom grammars, declare `languages: {name: {libraryPath, extensions, expandoChar}}` in the config.
The parser library path is relative to the config directory, and the rule's language must match the declaration.
Known external language aliases do not install a parser; scanning without the required declaration reports omitted rules.

## Commands and execution

| Command or option | Behavior |
| --- | --- |
| `check <paths...>` | Judge files, using config `files` when no positional paths are given, otherwise the current tree. |
| `run <id> <paths...>` | Select one rule id, routing git subjects to `commits`. `--file <file>` selects explicit rule-file contents. |
| `review --base <ref>` | Scan changed files and judge only subjects overlapping changed lines. Without a base, use uncommitted changes. |
| `review --staged` | Inspect the index, not unstaged or untracked content. |
| `commits <range>` | Judge message/diff or change/instructions subjects from a git range; default range uses `--base` or upstream. |
| `commits --staged` | Change subjects only. Read instructions from staged `AGENTS.md`, falling back to `CLAUDE.md`. |
| `commits --squash --message-file <path or ->` | Judge a combined range against supplied text, with `-` reading stdin. |
| `rules --json` | List loaded custom rules and validation errors. Empty defaults are a valid empty list. |
| `--dry-run --show-subjects` | Plan requests and show matched subjects without inference. |
| `--group file` / `rule` / `auto` | File grouping is default; auto compares estimated costs per rule. |
| `--concurrency`, `--batch-size`, `--rule-batch-cap` | Defaults 32, 256, 32. Server size refusals can split questions; the planner can reduce state. |
| `--retry <n>` | Independent judgment passes, default 1. More than one bypasses persistent verdict caching. Gateway caching can still reuse equivalent requests. |
| `--transport cloudflare` / `typesafe` | Select explicit route. Cloudflare has no direct fallback and defaults to no additional transport retries, leaving Gateway retry policy unchanged. |
| `--force` / `--cache none` | Bypass local cached verdict reads or disable local persistence. Neither disables Gateway caching. |
| `--record <path>` / `replay <path>` | Save a run or re-score it locally under new cutoffs. |
| `--threshold <id=n>` | Override a cutoff, repeatable. `--at` is deprecated. |
| `--json`, `--format github`, `--show-missing` | Machine-readable findings, GitHub annotations, and explicit unanswered subjects. |

Exit codes are 0 for no findings, 1 for findings, 2 for unusable configuration, and 3 for unanswered inference work without a reportable verdict.
Findings are candidates for human review, not authorization for consequential actions.
Text rules without `split` refuse a whole-file subject exceeding `MAX_BLOCK_CHARS` (48,000 characters of non-trailing-blank content) before cache lookup or inference, with no verdict and exit 3 for both checks and dry runs.
The entire run is refused when any selected, unsuppressed whole-file subject exceeds that limit.
Split blocks and other file state retain their existing reported truncation or arm step-down behavior.

`hooks.precommit: {extends: true, rules: {...}}` overrides top-level rule selection for staged review and staged commits.
With `extends: false`, only the hook selection runs.
`init --pre-commit` and `init --pre-push` write helper hook bodies and preserve unrelated git hooks.
Custom rules must exist and be enabled before those helpers can judge anything.

## Fit and preserve a cutoff

For each custom rule suite, keep `rule.yml`, `fixtures/`, `expect.yml` and an accepted `baseline.json` together.
Expectations label defects and hard clean cases, not presumed model answers.

```bash
jev-lint eval --no-config -R /path/to/custom-rules --dry-run
jev-lint eval --no-config -R /path/to/custom-rules --repeat 3 --accept
jev-lint eval --no-config -R /path/to/custom-rules --replay
jev-lint calibrate /path/to/corpus --no-config -R /path/to/custom-rules --labels /path/to/labels.json --record /path/to/run.json
```

`eval` scores fixtures at the current rule cutoff, compares accepted decisions and reports missing answers rather than filling them with zero.
`--accept-last` promotes a previously recorded `last.json` without inference.
`last.json` is temporary, while accepted baselines belong in version control.
When the question or matcher changes, fit again and accept a new baseline.
A fitted `threshold` comment should identify the run, defect answers, highest clean answers and pass-to-pass spread.
Do not ship an uncalibrated threshold or claim a rule works solely because its matcher runs.

Local cache schema 5 includes route/model and full collected external evidence, deliberately invalidating more broadly than individual matched nodes.
Custom programmatic `AskClient` implementations must provide `cacheIdentity` covering their endpoint, model and credential scope to enable persistent reuse.
Existing cache files are trusted input: anyone able to edit verdicts can change findings.
Gateway keys independently cover endpoint, Gateway, credential scope and canonical full request JSON, with TTL 2592000 seconds by default.
The programmatic Jev client accepts a Gateway TTL from 60 to 2592000 seconds.
A cached response is not proof of a Gateway HIT, and live inference permissions and HIT status must be verified separately.
