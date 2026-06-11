# Adversarial Review — ERP Fish PRD

## Verdict

Pass for controlled story extraction. The previous High findings were handled: G6 now has an approved artifact, OQ-10 is split, and CAP promises use stricter labels. The remaining risk is narrower: OQ-10A still needs its own approved sensitive-field matrix before MVP-S09 can become implementation work.

## Findings

### Resolved H1. The G6 checklist is now explicit and approved

Evidence:

- `prd.md` §0.1 names `mvp-story-extraction-checklist.md` as the G6 evidence artifact.
- `mvp-story-extraction-checklist.md` is `status: approved`.
- Every checklist row has `Approval date` as `2026-06-11`.
- `MVP-S01~MVP-S03` are the only rows with `may generate implementation story = yes`.

Risk:

The missing artifact and approval-state problems are fixed for G6. Story generation can start only from `MVP-S01~MVP-S03`.

Fix:

No further fix needed for H1. Keep the rule that `MVP-S04~MVP-S10` cannot become implementation stories until their closure artifacts are approved.

### M1. OQ-10A is split correctly, but the approval artifact is still conceptual

Evidence:

- `prd.md` §4.1 marks the sensitive field matrix as `draft baseline`.
- `prd.md` §10 says OQ-10A closes only when the surface/role field matrix is approved.
- `mvp-story-extraction-checklist.md` MVP-S09 depends on an `OQ-10A 승인본`.

Risk:

The split prevents "OQ-10 closed" confusion, but it does not yet provide the approved field contract that implementation can test. CAP-13 MVP security is marked `contracted build`, so the lack of approved acceptance criteria is a near-term build risk.

Fix:

Create or approve the OQ-10A sensitive field exposure matrix as its own small artifact, or mark CAP-13 MVP implementation stories blocked until the matrix is approved.

### Resolved M2. CAP commitment label authority is explicit enough

Evidence:

- §8 defines the commitment labels in the CAP 약속 원장.
- The earlier CAP tracking table still uses descriptive dependency phrases alongside labels.

Risk:

This is not a current blocker. The ledger is strict, and §8 says actual implementation commitment follows the CAP 약속 원장의 commitment label.

Fix:

No further fix needed unless the CAP ledger is later split into a separate artifact.

## Residual Risk

No critical product-definition gaps remain from the three requested findings. The PRD is still not final story-source material because approval artifacts remain open by design.
