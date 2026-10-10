---
description: Judge documents with explicitly selected custom prose rules through Cloudflare AI Gateway.
argument-hint: "<paths...>"
---

This fork has no bundled Markdown rules.
Use the user's explicitly supplied prose rule directory and job configuration, or author and calibrate custom rules before proceeding.
Do not discover repository rules automatically and do not use upstream package paths.

1. Run `jev-lint check --config <job-config> -R <custom-prose-rules> $ARGUMENTS --dry-run --cache none --show-subjects`.
2. Confirm selected rules, target sections and supplied context before inference.
3. Pin `--transport cloudflare --model typesafe/jev`, or those config fields, for a Gateway-only job.
4. Check Cloudflare account, Gateway and credential presence without displaying secrets; unavailable permissions are a blocker, not a reason to try direct Typesafe.
5. Run the same explicit selection without `--dry-run`, inspect findings against the quoted evidence and distinguish missing judgments from clean results.
6. Do not rewrite the document unless asked.
