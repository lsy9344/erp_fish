# PRD Quality Review — ERP Fish PRD

## Overall verdict

Overall verdict: **adequate**. The June 11 draft is materially safer than the prior validation target: the sensitive-metric contradiction has been split into MVP minimum security versus CAP-13 policy hardening, the MVP story-readiness table now includes the previously missing OQ impacts, and the CAP table has release buckets. It is still not final build-ready because the PRD intentionally leaves several MVP story blockers open and uses "후속 확정" buckets that still need commitment artifacts before clean epic/story extraction.

## Decision-readiness — adequate

The PRD is honest about its state. §0.1 says the document remains **draft** and should not be treated as "그대로 에픽/스토리 생성 가능한 최종 PRD" until G1~G5 close. The gate table names the right blockers: release boundary, calculation policy, inventory/FIFO policy, permission/audit contract, and meeting/report data contract.

§0.2 is also much more decision-useful than the prior version. It distinguishes MVP, approved extension, contract/ops, and deferred scope, then breaks MVP story readiness into slices. That directly addresses the previous problem where FR-13 and sensitive indicators could be implemented too early.

### Findings

- **high** MVP story generation is still gated by open policy decisions (§0.1, §0.2, §10) — This is now clearly disclosed, but it still means the PRD cannot be used as a final story source without first closing OQ-1, OQ-2, OQ-3, and the MVP minimum slice of OQ-10. *Fix:* Before running story generation, produce the G1/G2/G4 evidence artifacts named in §0.1 and either close those OQs or mark the affected FR slices as discovery-only stories.
- **high** Several CAP release buckets are categories, not delivery commitments (§8) — The table now says "후속 확정" or "OQ 종결 전 차단", which is a real improvement, but it still does not say whether a CAP is in the next paid release, a later committed release, or only approved for future planning. *Fix:* Add a target release/contract column or a separate CAP commitment ledger with owner, target milestone, and approval artifact.

## Substance over theater — strong

The PRD remains grounded in the real operating problem: replacing OneDrive Excel with a head-office control tower for daily branch ledgers. The source addendum ties the PRD to actual Excel files, branch ledgers, meeting notes, and customer-requested changes rather than generic ERP language.

The new detail is mostly earned. The action-level permission matrix, closeability table, edit-token conflict policy, MVP price-source priority, upload row identity, and backup/RTO/RPO minimums are all product-specific and reduce real implementation ambiguity.

### Findings

None.

## Strategic coherence — adequate

The core thesis is coherent: ERP Fish should make head office ready for the morning meeting by centralizing branch ledger status, risk signals, closing, corrections, and reports. FR-15~FR-21 and SM-1~SM-3 strongly serve that thesis.

The extension structure is clearer than before. §8 now gives phase goals and exit conditions, which makes the expansion from control/permissions into uploads, FIFO, employee reference data, reports, and alerts easier to reason about. The remaining issue is that the extension set is still broad and can become a parallel backlog unless the CAP commitment decision is made.

### Findings

- **medium** Extension breadth still risks diffusing the operating thesis (§8) — Extension B, C, and D cover uploads/FIFO, employee/payroll reference, report expansion, alerts, and AI-ready data. The phase goals help, but the PRD does not yet state which phase preserves the morning-meeting thesis if delivery capacity is limited. *Fix:* Add a one-paragraph extension priority rule: if capacity tightens, which phase protects the core operating outcome first and which phase can slip.

## Done-ness clarity — adequate

Done-ness is much stronger after the latest update. FRs generally have testable consequences, and high-risk areas now have acceptance boundaries: §3.2 defines edit tokens and conflict resolution; §4.1 defines action permissions and MVP sensitive-data minimums; §4.5 defines closeability hard stops; §4.7 defines report contracts; §8.2 defines upload states and row identity.

The remaining done-ness gaps are not broad missing sections. They are narrow places where a later story writer still needs exact numeric or field-level settings.

### Findings

- **medium** Account security still lacks numeric thresholds (§4.1) — FR-1 now requires forced password change, failed-login restriction, session expiry, inactive-session blocking, and audit logging. But "일정 횟수" and "세션 만료 시간" are still not testable values. *Fix:* Add minimum defaults such as failed-login count, lockout duration, session timeout, and password reset expiry.
- **medium** MVP price basis still allows unapproved cost/profit inputs to drive management numbers (§4.3, §4.5) — The MVP unit-price priority starts with user-entered ledger line price and allows individual close with a reason when price basis is missing. That may be appropriate, but it means profit and inventory numbers can still depend on field input without approval state. *Fix:* Add a price-basis status per ledger line, and require "approved", "manual override", or "basis missing" to appear in close summaries and reports.
- **medium** Sensitive-field allowlists are conceptually clear but not enumerated per surface (§4.1, §4.7, §8.6) — The PRD says UI, server response, export, shared links, cache, and alerts must enforce sensitive-data restrictions, but does not list the actual allowed fields per role/surface. *Fix:* Add a small field exposure matrix for 지점장, 본사 조회 전용, 본사 관리자, export, and alert templates.

## Scope honesty — strong

Scope honesty is now a strength. The PRD does not pretend to be final: it keeps `status: draft`, uses implementation gates, preserves OQ closure order, and separates MVP, approved extensions, contract/ops, and deferred items. The Assumptions Index is also clean: there are no inline `[ASSUMPTION]` tags, and unresolved items are centralized in §10.

### Findings

None.

## Downstream usability — adequate

The document is source-extract friendly for downstream UX, architecture, and stories. FR IDs are contiguous, CAP IDs are indexed numerically, OQs have closure sequencing, and the glossary defines the domain nouns that drive implementation. The addendum also preserves legacy Excel and meeting context without crowding the PRD body.

The one downstream concern is that some implementation-facing terms remain in the main text even though a glossary maps them to operator-facing wording.

### Findings

- **low** Technical terms still appear in policy text after the glossary (§3, §4, §8) — Terms such as `mutation`, `commit`, `preview`, `idempotency`, `export`, and `cache` are explained, but they still appear in tables where business reviewers may approve policy. *Fix:* Use paired wording consistently, for example "업로드 확정 반영(commit)", or replace the technical term after the glossary.

## Shape fit — strong

The shape fits an internal brownfield operations tool. A capability-heavy PRD with permissions, audit, state models, calculations, reports, and operational NFRs is the right form. The four user journeys are enough to ground UX without forcing a consumer-product persona structure.

### Findings

None.

## Mechanical notes

- Frontmatter status is `draft`, updated `2026-06-11`.
- FR IDs are contiguous: FR-1 through FR-29.
- CAP IDs are all present: CAP-1 through CAP-19.
- OQ IDs are contiguous: OQ-1 through OQ-18.
- SM IDs are contiguous: SM-1 through SM-11, plus counter-metrics SM-C1 through SM-C5.
- UJ IDs are contiguous: UJ-1 through UJ-4, with named protagonists.
- No inline `[ASSUMPTION]`, `TODO`, or `TBD` markers were found in `prd.md`.
