# Upstream differences

Comparison baseline: [mizchi/jev-lint af58a3bd20693f828ff6353e3543c0ab5bb7bad4](https://github.com/mizchi/jev-lint/tree/af58a3bd20693f828ff6353e3543c0ab5bb7bad4).
The intended fork repository is `totto2727/jevlint`; package and CLI names remain `jev-lint`, and publication is not part of this change.
This is a source fork, not only deployment configuration: runtime rule defaults, inference transport and cache scoping differ from upstream.

## Custom-only rule distribution

All upstream production rule packs are removed from `rules/`.
`shippedRulesPath()` returns null, `init` writes `rules: {}`, and repository configuration no longer selects deleted rule ids.
The generic loader, AST/text/git subjects, inheritance between explicitly loaded custom rules, context documents, calibration, replay, reports and custom-language support remain available.
Default rule sources contain only `.jev-lint/rules/` when present beside the selected config or current directory.
Explicit `-R` replaces that source, and a bare `./rules/` is never discovered.
Documentation callers must pass `-R` together with their explicit job config or `--no-config`; no documentation-specific repository-rule discovery is added.
No new production custom rules are introduced.

A subset of upstream rule suites is relocated to `test/fixtures/rules/` solely to preserve generic engine regression coverage, including AST framework matching, language selection, git subjects, calibration and replay.
Those fixtures are never default sources and are excluded from the npm package.
CI replay and built CLI smoke commands select them explicitly.
`RULES.md`, README translations and the reference describe the custom-only defaults.
Historical documents and experiments retain upstream evidence, not a currently bundled catalogue.

## Explicit Cloudflare transport

`--transport cloudflare`, config `transport: cloudflare`, or `JEV_LINT_TRANSPORT=cloudflare` selects the Workers AI universal endpoint and defaults to model `typesafe/jev`.
The CLI and generic runner default to Cloudflare. Direct Typesafe inference requires explicit `--transport typesafe`, configuration/environment selection, or an injected direct client.
The low-level `Jev` SDK constructor retains its upstream direct Typesafe default and `jev-latest` model.
Gateway redirects are rejected and identifiers and credential header content are validated before transport. Gateway cost output is labeled as a Typesafe reference estimate, not Cloudflare billing.
Cloudflare uses the account and Gateway IDs plus inference bearer token from `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_GATEWAY_ID` and `CLOUDFLARE_AI_GATEWAY_API_KEY`.
It sends `{model, input: {state, questions}}` to the fixed Cloudflare account endpoint, never an OpenAI-compatible endpoint or direct Typesafe fallback.
Only successful completed universal envelopes with exact answer coverage can produce verdicts.
Requests include Gateway cache opt-in headers and a SHA-256 key over endpoint, Gateway, credential scope and full canonical payload.
The default TTL is 2592000 seconds and the programmatic client accepts 60 through 2592000 seconds.

Implementation follows local `agent/plugins/external-information/skills/cloudflare-ai/SKILL.md`, its `references/decision-models.md`, and the existing documentation-quality transport in `agent/plugins/totto2727-coding/skills/documentation-quality/scripts/evaluate.mjs`.
Official references: [Workers AI REST](https://developers.cloudflare.com/workers-ai/get-started/rest-api/), [Gateway REST](https://developers.cloudflare.com/ai-gateway/usage/rest-api/), [Gateway cache semantics](https://developers.cloudflare.com/ai-gateway/features/caching/).
The request contract and failure paths are tested with an injected transport; live validation requires user-controlled inference permissions and is not assumed from a token's storage name.

## Safe local verdict reuse

Cache schema 5 discards older entries.
The runner includes model/route identity and all collected source, symbol, related-test, subject and context-document content in its cache scope.
This intentionally sacrifices per-node cache locality: edits elsewhere in the collected state can invalidate unchanged subjects rather than reuse a judgment over different external evidence.
Threshold-only changes remain free to re-score without changing the judgment request.
Gateway reuse remains best-effort, not strict cross-process deduplication or exactly-once inference.
Neither credentials nor request bodies are written to tracked cache keys.
