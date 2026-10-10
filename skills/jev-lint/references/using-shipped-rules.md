# Selecting custom rules

This fork has no shipped production rules.
There is no packaged TypeScript, Rust, Markdown, shell or git rule pack to select.
`jev-lint init` writes `rules: {}`, and `.jev-lint/rules/` is the sole default rule source when present.
Write and fit custom rules first, then enable their ids in configuration.

```bash
jev-lint rules --no-config -R /path/to/custom-rules --json
jev-lint check --no-config -R /path/to/custom-rules /path/to/targets --dry-run --cache none
```

For documentation jobs, always supply `-R` and an explicit config or `--no-config` with target paths.
Do not discover or enable repository rules implicitly.
Pin `transport: cloudflare` and `model: typesafe/jev` for Gateway-only jobs.
Missing inference credentials produce no verdict and never trigger direct Typesafe fallback.
See [the maintained reference](../../../docs/reference.md) and [project authoring](writing-project-rules.md).
