# Story Status Migration: 2026-06-15

## Context

The current `sprint-status.yaml` was generated from the reworked PRD/epics structure, while many older implementation story files already have `Status: done`. This document maps those older story files to the new story keys so automation does not duplicate work or falsely mark new acceptance criteria complete without re-verification.

Authoritative inputs:

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/sprint-change-proposal-2026-06-10-readiness-dependency-fixes.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- Existing story files in `_bmad-output/implementation-artifacts/*.md`

## Migration Rules

- `coverage: full` means the old story appears to cover the new story intent, but the new story still needs current AC verification before `sprint-status.yaml` is changed to `done`.
- `coverage: partial` means the old story covers part of the new story and should be used as implementation evidence for a follow-up.
- `coverage: superseded` means the old story belongs to a previous numbering/scope and should not be rerun as-is.
- `coverage: none` means no old implementation evidence was found.
- New `sprint-status.yaml` statuses remain `backlog` unless this migration explicitly says `keep review` or a later verification updates the status.

## Old-To-New Mapping

| Old story file | Old status | New story key(s) | Coverage | Action | Notes |
| --- | --- | --- | --- | --- | --- |
| `1-1-스타터-템플릿으로-초기-프로젝트를-설정하고-본사-업무-공간에-로그인한다.md` | done | `1-1-프로젝트-앱-기반과-인증-골격-초기화` | partial | use as evidence | New Story 1.1 adds explicit T3/Prisma/Auth/shadcn baseline checks. |
| `1-2-지점장이-배정된-지점-업무-공간에만-로그인한다.md` | done | `1-3-역할-기반-로그인과-지점-접근-제한` | partial | use as evidence | Store access behavior maps to role/access story. |
| `1-3-본사가-지점-정보를-관리한다.md` | done | `5-1-지점-마스터-관리` | partial | use as evidence | Master-data story moved from old Epic 1 to new Epic 5. |
| `1-4-본사가-사용자-계정과-지점-접근-권한을-관리한다.md` | done | `1-2-사용자-지점-권한-프로파일-모델링`, `1-3-역할-기반-로그인과-지점-접근-제한` | partial | split evidence | New structure separates model and access behavior. |
| `1-5-본사가-품목-마스터와-매입-기준을-관리한다.md` | done | `5-2-품목-마스터-기본-관리`, `5-3-매입-기준-관리` | partial | split evidence | OQ-3 normalization stays discovery/policy, not implementation. |
| `1-6-본사가-장부-입력-코드를-관리한다.md` | done | `5-4-장부-입력-코드-관리` | partial | use as evidence | Reverify inactive-code and audit AC before done. |
| `1-7-본사가-기준정보와-권한-변경-이력을-확인한다.md` | done | `1-5-감사-로그-기반-구축` | partial | use as evidence | Audit foundation maps to new Epic 1. |
| `2-1-지점장이-오늘-장부를-열고-매출-결제를-저장한다.md` | done | `2-1-지점-일자-장부-생성과-상태-관리`, `2-3-매출-결제와-비용-입력` | partial | split evidence | Creation/status and sales/payment are separate in new epics. |
| `2-2-지점장이-비용과-근무-정보를-저장하고-기본-계산을-본다.md` | done | `2-3-매출-결제와-비용-입력`, `2-8-근무인원-특이사항과-검토-제출`, `3-1-기본-계산-모듈과-상태-표현` | partial | split evidence | Basic calculation policy must stay within MVP-S02. |
| `2-3-지점장이-매입-품목을-기준정보에서-선택해-입력한다.md` | done | `2-4-mvp-수동-매입-입력` | partial | use as evidence | CAP-6 upload remains excluded. |
| `2-4-지점장이-전일-이월-재고를-불러와-품목별-재고를-수정한다.md` | done | `2-4a-본사가-월초-재고-스냅샷을-생성하고-검증한다`, `2-5-재고-입력과-이월-상태-표시` | partial | follow-up required | Old story did not explicitly model the new monthly-opening snapshot story. |
| `2-5-지점장-또는-본사가-실제-재고-차이를-조정-사유와-함께-기록한다.md` | done | `2-6-재고-조정-기록` | partial | use as evidence | Reverify new audit and status AC. |
| `2-6-지점장이-손실-폐기-떨이를-입력하고-재고-흐름에-반영한다.md` | done | `2-7-손실-폐기-떨이-입력` | partial | use as evidence | Hope-price loss policy remains blocked. |
| `2-7-입력자가-검토-화면에서-계산값과-이상-후보를-확인한다.md` | done | `3-3-검토-화면의-계산-검증-요약` | partial | use as evidence | Sensitive field restrictions must use current PRD baseline. |
| `2-8-입력자가-장부를-검토-대기로-제출한다.md` | done | `2-8-근무인원-특이사항과-검토-제출` | partial | use as evidence | Reverify submission/idempotency AC. |
| `2-9-지점장-장부-입력-검토-서버-응답에서-민감-회계-지표를-차단한다.md` | review | `1-4-서버-권한-헬퍼와-민감-필드-응답-차단`, `3-3-검토-화면의-계산-검증-요약`, `6-4-본사-전용-export와-권한-차단` | partial | keep review | Updated on 2026-06-15 to remove `grossMarginRate` and `inventoryAmount` from store-manager review response/UI. |
| `3-1-본사가-전체-지점-장부-상태를-관제판에서-본다.md` | done | `4-1-본사-전체-지점-관제판-조회` | partial | use as evidence | Reverify new status labels and priority AC. |
| `3-2-본사가-이상-신호-기준값을-설정한다.md` | done | `5-5-이상-신호-기준값-설정-구조` | partial | use as evidence | OQ-1 policy remains discovery before full signal judgment. |
| `3-3-본사가-매출-이익률-매출차액-이상-신호를-본다.md` | done | `4-2-관제판-이상-상태와-기준-확인-필요-표시`, `3-4-계산-정책-미정-항목-차단과-테스트-기준` | partial | use as evidence | Reverify OQ-gated states are not treated as approved policy. |
| `3-4-본사가-재고-손실-이상-신호를-본다.md` | done | `4-2-관제판-이상-상태와-기준-확인-필요-표시` | partial | use as evidence | Reverify missing/insufficient state wording. |
| `3-5-본사가-회의-전에-문제-지점을-빠르게-추적한다.md` | done | `4-1-본사-전체-지점-관제판-조회`, `4-2-관제판-이상-상태와-기준-확인-필요-표시` | partial | use as evidence | Navigation and priority behavior are supporting evidence. |
| `4-1-본사가-검토-대기-장부를-보완하고-수정한다.md` | done | `4-3-본사-마감-전-장부-보완-수정` | partial | use as evidence | Reverify HQ edit guards and revalidation. |
| `4-2-본사가-장부를-마감하고-원본을-잠근다.md` | done | `4-5-본사-마감과-원본-잠금` | partial | use as evidence | Reverify close preflight dependency. |
| `4-3-본사가-마감된-장부에-정정-기록을-추가한다.md` | done | `4-6-마감-후-정정-기록과-정정-반영값` | partial | use as evidence | Updated on 2026-06-15 to apply `PURCHASE_ROW:amount` in the shared overlay. |
| `4-4-본사가-원본값과-정정-반영값을-구분해-본다.md` | done | `4-6-마감-후-정정-기록과-정정-반영값` | partial | use as evidence | Original/applied value split supports new Story 4.6. |
| `4-5-관제판이-정정-반영값을-기본으로-사용한다.md` | done | `4-1-본사-전체-지점-관제판-조회`, `4-6-마감-후-정정-기록과-정정-반영값` | partial | use as evidence | Updated on 2026-06-15 to pass purchase items into correction overlay. |
| `5-1-본사가-일별-아침-회의-리포트를-본다.md` | done | `6-1-일별-아침-회의-리포트` | partial | use as evidence | Reverify current report freshness and permission AC. |
| `5-2-본사가-리포트-숫자의-근거와-정정-차이를-추적한다.md` | done | `6-1-일별-아침-회의-리포트`, `6-2-지점별-기간-비교-리포트`, `6-3-월간-지점-요약-리포트` | partial | split evidence | Evidence components are shared across reports. |
| `5-3-본사가-선택-기간의-지점별-실적을-비교한다.md` | done | `6-2-지점별-기간-비교-리포트` | partial | use as evidence | Updated on 2026-06-15 to revalidate `/app/reports/comparison` from ledger/inventory/loss/close writes. |
| `5-4-본사가-월간-지점별-마감과-이상-현황을-본다.md` | done | `6-3-월간-지점-요약-리포트` | partial | use as evidence | Monthly status/anomaly summary maps to new Epic 6. |
| `5-5-본사가-월간-손실-재고-흐름과-핵심-성과를-본다.md` | done | `6-3-월간-지점-요약-리포트` | partial | use as evidence | Monthly loss/inventory flow maps to new Epic 6. |

## Sprint Status Decision

`sprint-status.yaml` now includes `2-4a-본사가-월초-재고-스냅샷을-생성하고-검증한다` before `2-5-재고-입력과-이월-상태-표시`. Existing story files are evidence, not automatic completion claims. Keep new story statuses as `backlog` until each new story's current AC list is verified with code, tests, and runtime evidence.

## Automation Guard

Use `_bmad-output/story-automator/orchestration-g6-20260615-121435.md` for implementation automation. The old 49-story orchestration is superseded because it included Epic 7/8 discovery-policy stories in the implementation queue.
