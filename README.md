# jev-lint: custom rules only

This fork of [mizchi/jev-lint](https://github.com/mizchi/jev-lint) keeps the generic natural-language lint engine and rule-authoring tools, but bundles no production rules.
The repository is `totto2727-org/jevlint`, the package name is `@totto2727/jevlint`, and the CLI name remains `jev-lint`.
See [fork differences](docs/upstream-differences.md) for the pinned upstream revision and operational changes.
Node.js 24 or later is required.

## Explicit rules

`jev-lint init` writes a valid starter `.jev-lint.yaml` with `rules: {}`.
Author your own rules in `.jev-lint/rules/` and enable their ids in that configuration.
Without `-R` or config `rulePaths`, only `.jev-lint/rules/` beside the selected config (or current directory when no config is selected) is a rule source.
A bare `./rules/` directory, upstream packs and test fixtures are never automatically loaded.
`jev-lint rules --json` lists available custom rules, including an empty list when none exist.
A check without usable rules exits 2 with setup guidance, not a clean verdict.

For isolated documentation jobs, set `rulePaths: [./custom-rules]` and explicit `rules` selection in a job config, then run `jev-lint check --config /path/to/job.yml /path/to/actual.md` directly.
`rulePaths` and optional shared `context: [./conventions.md]` resolve relative to the config file, and `rulePaths` disables implicit discovery; CLI `-R` still takes precedence.
See the [configuration reference](docs/reference.md#selection-and-configuration) for evidence limits and whole-file Text rules without `split`.
Alternatively, pass an explicit config and `-R`, or use `--no-config -R` with explicit target paths.
`--no-config` alone does not disable `.jev-lint/rules/` lookup, so always include `-R` for jobs that must not discover repository rules.

```bash
npm ci
npm run build
node dist/cli.js check --no-config -R /path/to/custom-rules /path/to/targets --dry-run --cache none
node dist/cli.js check --config /path/to/job.yml -R /path/to/custom-rules --transport cloudflare --model typesafe/jev --json
```

## Cloudflare AI Gateway

Select `--transport cloudflare`, `transport: cloudflare` in the config, or `JEV_LINT_TRANSPORT=cloudflare`.
A CLI flag overrides the config, which overrides the environment.
This route defaults to `typesafe/jev` unless `--model`, config `model` or `JEV_LINT_MODEL` selects another model.
The CLI and generic runner default to Cloudflare. Select `--transport typesafe` explicitly for direct compatibility, or inject a direct `new Jev()` client programmatically.
The low-level `Jev` SDK constructor retains its upstream direct default.
Cloudflare never falls back to that transport on failure.

Supply these environment variables without putting credentials in tracked files:

- `CLOUDFLARE_ACCOUNT_ID`: Workers AI account ID.
- `CLOUDFLARE_AI_GATEWAY_ID`: existing Gateway ID.
- `CLOUDFLARE_AI_GATEWAY_API_KEY`: bearer token with Workers AI inference permissions.

Cloudflare sends `POST https://api.cloudflare.com/client/v4/accounts/<account>/ai/run`, `Authorization: Bearer <token>` and `cf-aig-gateway-id`.
The body is `{model, input: {state, questions}}`, not an OpenAI chat request or a native `@cf/typesafe/jev` URL.
`baseUrl` and `TYPESAFE_BASE_URL` affect only the direct Typesafe route.
A config may use `apiKeyEnv` to name a different credential environment variable, but never a literal `apiKey`.
Completed universal response envelopes are normalized from `result.result`; malformed, failed, pending and incomplete responses produce no verdict.

Every Gateway request opts into caching with a content-derived `cf-aig-cache-key`, `cf-aig-cache-ttl: 2592000` and `cf-aig-skip-cache: false`.
The key covers endpoint, Gateway, hashed credential scope, model and complete canonical request content, including external state and criteria.
Gateway caching is best-effort, not exactly-once execution, and requests may be retried after failures.
Redirects are rejected. Account IDs must be 32 hexadecimal characters and Gateway IDs must contain only letters, digits, underscores or hyphens, starting with a letter or digit.
Gateway reports label `spent.usd` as a Typesafe reference estimate at $0.042 per million input tokens, not actual Cloudflare billing.
Local verdict keys also cover the selected route/model and all collected source, graph, related-test and context-document content.
Schema 5 invalidates older unsafe local caches, and conservative invalidation may cause more misses after unrelated edits.
Use `--force` or `--cache none` when freshness matters, although neither disables Gateway caching.

Official sources: [Workers AI REST setup](https://developers.cloudflare.com/workers-ai/get-started/rest-api/), [Gateway REST API](https://developers.cloudflare.com/ai-gateway/usage/rest-api/), [Gateway caching](https://developers.cloudflare.com/ai-gateway/features/caching/).

## Authoring and validation

Rules can match AST nodes, text blocks, commits or changes.
Each rule supplies its own natural-language question, criteria or score levels, context documents and fitted threshold.
The engine retains rule inheritance, custom grammar declarations, batching, diff filtering, replay, calibration, reports and git-hook helpers.
No arbitrary custom rules are provided by this fork.
See the [authoring reference](docs/reference.md) for fields and examples.

```bash
node dist/cli.js eval --no-config -R /path/to/custom-rules --dry-run
node dist/cli.js eval --no-config -R /path/to/custom-rules --accept
node dist/cli.js eval --no-config -R /path/to/custom-rules --replay
npm run ci
npm run test:dist
npm pack --dry-run
```

Test-only regression suites under `test/fixtures/rules/` are excluded from the published package.
Historical upstream measurements and experiments are not guarantees for your custom rules or Gateway account.
