## Run: 2026-06-12T19:32:01Z

**Epic:** erp_fish - Epic Breakdown
**Stories:** 1.1-8.9

### Patterns Observed
- The full orchestration completed 49/49 stories with per-story create, dev, automate, review, and commit checkpoints.
- Policy/discovery stories frequently caused automate to generate product or test drift outside the intended document-only scope.
- Source-of-truth checks against `sprint-status.yaml` and story artifacts were more reliable than parser output; `parse-output` often returned invalid JSON while the workflow state was valid.
- Long-running tmux sessions commonly outlived the first monitor timeout, so direct `tmux-status-check` plus sprint-status verification was the right recovery path.

### Code Review Insights
- Common issues: out-of-scope `src/`, `tests/`, Playwright config, and test-summary drift; missing `done` synchronization after review fixes; file lists needing reconciliation.
- Senior review regularly restored policy-only boundaries and synced story/sprint status to `done`.
- Average cycles to clean: one review cycle for the resumed Epic 8 stories.

### Timing Estimates
- create-story: usually one monitor timeout or less, with direct verification fallback.
- dev-story: often one monitor timeout plus a second monitor pass for policy-heavy stories.
- code-review: usually one monitor pass, with source verification afterward.

### Recommendations for Future Runs
- For policy-only stories, instruct automate up front to prefer document/contract checks over adding runtime tests unless the story explicitly allows `src/`, `tests`, or config changes.
- Keep using source-of-truth verification after every tmux step; do not rely on parser JSON alone.
- Preserve the WSL Codex PATH override for every child session to avoid resolving the Windows Codex package.
- Avoid putting a commit hash inside the same commit that records it; the hash changes on amend.
