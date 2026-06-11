# Validation Report — ERP Fish PRD

- **PRD:** `C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\prd.md`
- **Rubric:** `C:\Code\Project\erp_fish\.agents\skills\bmad-prd\assets\prd-validation-checklist.md`
- **Run at:** 2026-06-11T10:46:48+09:00
- **Grade:** Fair

## Overall verdict

루브릭 리뷰는 현재 PRD를 **adequate**로 보았습니다. 2026-06-11 draft는 이전 검증 대상보다 훨씬 안전합니다. 민감 지표 충돌, FR-13/OQ 영향 누락, CAP 릴리스 경계 부재는 본문에서 상당히 정리되었습니다.

추가 비판 리뷰는 **critical 없이 high 3건**을 제기했습니다. 핵심은 PRD 내용이 부족하다는 것보다, 문서가 아직 `draft`이고 MVP story generation 전에 닫아야 할 OQ와 CAP commitment가 남아 있다는 점입니다.

## Dimension verdicts

- Decision-readiness — adequate
- Substance over theater — strong
- Strategic coherence — adequate
- Done-ness clarity — adequate
- Scope honesty — strong
- Downstream usability — adequate
- Shape fit — strong

## Findings by severity

### Critical (0)

없음.

### High (3)

**[Decision-readiness] MVP story generation is still gated by open policy decisions** (§0.1, §0.2, §10)

The PRD clearly discloses the blockers, but it still cannot be used as a final story source until OQ-1, OQ-2, OQ-3, and the MVP minimum slice of OQ-10 are closed or converted into discovery-only stories.

Fix: Before story generation, produce the G1/G2/G4 evidence artifacts and classify each FR slice as implementation story, discovery story, or blocked.

**[Decision-readiness] Several CAP release buckets are categories, not delivery commitments** (§8)

The new 릴리스 버킷 table is useful, but "후속 확정" does not yet say whether each CAP belongs to the next paid release, a later committed release, or future planning.

Fix: Add a target release/contract column or a CAP commitment ledger with owner, target milestone, and approval artifact.

**[Adversarial] MVP price basis still lacks a strong price-trust state** (§4.3, §4.5)

The MVP unit-price priority is defined, but user-entered price can drive cost/profit numbers and individual close can proceed with a reason when price basis is missing.

Fix: Add source, verification status, approved by, effective date, and manual override reason per price; show price-trust status in close summaries and reports.

### Medium (6)

**[Strategic coherence] Extension breadth still risks diffusing the operating thesis** (§8)

The phase goals help, but uploads/FIFO, employee/payroll reference, report expansion, alerts, and AI-ready structure still form a broad extension set.

Fix: Add an extension priority rule for what protects the morning-meeting control-tower thesis first when delivery capacity tightens.

**[Done-ness clarity] Account security still lacks numeric thresholds** (§4.1)

The PRD requires failed-login restriction, session expiry, and forced password change, but does not set testable defaults.

Fix: Add failed-login count, lockout duration, session timeout, and reset-token expiry defaults.

**[Done-ness clarity] Sensitive-field allowlists are not enumerated per surface** (§4.1, §4.7, §8.6)

The policy covers UI, server response, export, links, cache, and alerts, but not the actual field list per role and surface.

Fix: Add a field exposure matrix for 지점장, 본사 조회 전용, 본사 관리자, export, and alert templates.

**[Adversarial] OQ-10 combines MVP minimum blocking and extension hardening** (§10)

This is accurate but can confuse what "OQ-10 closed" means.

Fix: Split OQ-10 into MVP minimum exposure approval and CAP-13 hardening policy, or add two close criteria inside the current OQ.

**[Adversarial] Employee/payroll privacy retention is still deferred** (§8.1, §10)

The PRD recognizes field-level rights, but retention/deletion/anonymization policy still waits on OQ-12.

Fix: Create a privacy retention table before CAP-1/CAP-9 epic work.

**[Adversarial] Restore drill acceptance is still thin** (§5)

RPO/RTO are stronger, but the restore rehearsal success criteria do not list which artifacts must be restorable.

Fix: Include ledger, close events, corrections, upload originals, preview/commit/void history, and audit-log search in the restore drill criteria.

### Low (2)

**[Downstream usability] Technical terms remain in approval-facing text** (§3, §4, §8)

Terms such as mutation, commit, preview, idempotency, export, and cache are explained but still appear widely.

Fix: Prefer operator-facing Korean terms after the glossary, or pair terms only on first use.

**[Adversarial] Some phase labels remain English-coded** (§8)

Extension A/B/C/D and Contract/Ops are not blocking, but look less polished in a Korean approval artifact.

Fix: Optionally rename to 확장 A/B/C/D and 계약/운영.

## Mechanical notes

- Frontmatter status is `draft`, updated `2026-06-11`.
- FR IDs are contiguous: FR-1 through FR-29.
- CAP IDs are all present: CAP-1 through CAP-19.
- OQ IDs are contiguous: OQ-1 through OQ-18.
- SM IDs are contiguous: SM-1 through SM-11, plus counter-metrics SM-C1 through SM-C5.
- UJ IDs are contiguous: UJ-1 through UJ-4, with named protagonists.
- No inline `[ASSUMPTION]`, `TODO`, or `TBD` markers were found in `prd.md`.

## Reviewer files

- `C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\review-rubric.md`
- `C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\review-adversarial-general.md`
