# Upstream differences

Comparison baseline: [mizchi/jev-lint af58a3bd20693f828ff6353e3543c0ab5bb7bad4](https://github.com/mizchi/jev-lint/tree/af58a3bd20693f828ff6353e3543c0ab5bb7bad4).

## Incomplete replay exit status

`src/cli/cmd-replay.ts` now exits `3` when the gate counts unanswered recorded subjects and no finding meets the active severity floor.
Run records preserve missing answers but do not retain the request errors that caused them, so checking findings alone could incorrectly return success for an incomplete run.
A blocking finding still takes precedence with exit `1`, and fully answered runs retain their existing severity-sensitive exit behavior.
The policy is identical for text, JSON and GitHub output, and replay remains offline with unchanged findings, output schema, recorded rules and threshold semantics.
Public CLI regression coverage lives in `test/cli.test.ts`, and the exit contract is documented in `docs/reference.md`.
This is a runtime source difference, not deployment customization, and adds no dependency or production rule.
