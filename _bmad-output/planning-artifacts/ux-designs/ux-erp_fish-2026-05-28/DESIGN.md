---
name: ERP Fish
description: 수산물 유통 소매 지점 내부 ERP. 7~8개 지점의 일일 장부 입력과 본사 관제를 웹으로 전환. shadcn/ui + Tailwind CSS 기반; 이 DESIGN.md는 브랜드 레이어 델타만 정의한다.
status: final
created: 2026-05-28
updated: 2026-05-28
sources:
  - _bmad-output/planning-artifacts/briefs/brief-erp_fish-2026-05-28/brief.md
  - _bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md
colors:
  # shadcn 기본 토큰 중 primary, accent, 그리고 warning(커스텀 추가)만 오버라이드.
  # background, foreground, muted, muted-foreground, border, input, ring,
  # card, popover, destructive 는 shadcn 기본값 상속.
  primary: '#2563EB'
  primary-foreground: '#FFFFFF'
  accent: '#0EA5E9'
  accent-foreground: '#FFFFFF'
  primary-dark: '#60A5FA'
  primary-foreground-dark: '#0A0F1E'
  accent-dark: '#38BDF8'
  accent-foreground-dark: '#0A0F1E'
  # warning — shadcn 기본에 없는 시맨틱 토큰. 이상 신호 중 경고 등급에 사용.
  warning: '#F59E0B'
  warning-foreground: '#1A1000'
  warning-dark: '#FBBF24'
  warning-foreground-dark: '#1A1000'
typography:
  # shadcn 기본 폰트(Inter 또는 Geist Sans) 상속. display 오버라이드 없음.
  # 한국어 fallback 스택을 body에 명시.
  body:
    fontFamily: 'Inter, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif'
  # 숫자 데이터(매출, 재고, 이익률)는 tabular-nums 처리.
  numeric:
    fontVariantNumeric: 'tabular-nums'
    fontFeatureSettings: '"tnum"'
rounded:
  # shadcn 기본값보다 약간 tight. 업무용 도구 느낌 강조.
  sm: 4px
  md: 6px
  lg: 8px
  full: 9999px
spacing:
  # shadcn / Tailwind 기본 4px 기반 스케일 상속. 별도 오버라이드 없음.
components:
  # 장부 상태 배지 — 4가지 상태
  badge-closed:
    label: '본사마감'
    background: 'hsl(142 76% 36% / 0.12)'
    foreground: 'hsl(142 76% 36%)'
    background-dark: 'hsl(142 76% 36% / 0.2)'
    foreground-dark: 'hsl(142 76% 60%)'
    radius: '{rounded.full}'
  badge-review:
    label: '검토대기'
    background: '{colors.warning} / 0.12'
    foreground: '{colors.warning}'
    background-dark: '{colors.warning-dark} / 0.2'
    foreground-dark: '{colors.warning-dark}'
    radius: '{rounded.full}'
  badge-draft:
    label: '입력중'
    background: '{colors.primary} / 0.1'
    foreground: '{colors.primary}'
    background-dark: '{colors.primary-dark} / 0.15'
    foreground-dark: '{colors.primary-dark}'
    radius: '{rounded.full}'
  badge-empty:
    label: '미입력'
    background: 'muted'
    foreground: 'muted-foreground'
    radius: '{rounded.full}'
  badge-holiday:
    label: '휴무'
    background: 'muted'
    foreground: 'muted-foreground'
    radius: '{rounded.full}'
    style: 'italic'
  # 이상 신호 칩 — 관제판 행 내 표시
  signal-chip:
    background: 'destructive / 0.1'
    foreground: 'destructive'
    background-dark: 'destructive / 0.2'
    foreground-dark: 'hsl(0 86% 75%)'
    radius: '{rounded.full}'
    icon: 'required — 색상만으로 의미를 전달하지 않는다'
  # 관제판 지점 행
  dashboard-row:
    default: 'border-b border-border'
    hover: 'bg-muted/50 cursor-pointer'
    anomaly: 'bg-destructive/5 border-l-2 border-destructive'
    anomaly-warning: 'bg-warning/5 border-l-2 border-warning'
  # 재고 행 — 수정된 셀 강조
  inventory-row-modified:
    background: '{colors.primary} / 0.06'
    border-left: '2px solid {colors.primary}'
  inventory-row-new:
    background: 'hsl(142 76% 36% / 0.06)'
    border-left: '2px solid hsl(142 76% 36%)'
  # 단계형 폼 진행 표시기
  step-indicator-done:
    color: 'hsl(142 76% 36%)'
    icon: 'check-circle'
  step-indicator-active:
    color: '{colors.primary}'
    icon: 'circle-dot'
  step-indicator-pending:
    color: 'muted-foreground'
    icon: 'circle'
---

## Brand & Style

ERP Fish는 수산물 유통 소매 지점의 일일 장부를 OneDrive 엑셀에서 웹 ERP로 전환하는 내부 업무 도구다. 주 사용자는 본사 관리자(PC, 아침 회의 전 10분 내 전 지점 스캔)와 지점장(모바일, 퇴근 전 장부 입력)이다.

시각적 방향은 **깔끔하고 현대적인 SaaS**다. 불필요한 장식 없이 데이터를 읽는 속도를 최우선한다. shadcn/ui의 기본 표면 어휘를 브랜드 레이어가 **최소한으로만** 덮는다. "무엇을 더할까"보다 "무엇을 남길까"의 원칙으로 설계한다.

브랜드 델타는 두 가지 색상(`primary`, `accent`)과 `warning` 시맨틱 토큰, 숫자 데이터용 `tabular-nums` 처리, 그리고 장부 상태 배지와 이상 신호 칩이 전부다. 나머지는 shadcn이 옳다.

## Colors

ERP Fish 팔레트는 두 가지 브랜드 색상과 하나의 시맨틱 추가 토큰으로 구성된다.

- **Primary Blue (`#2563EB` light / `#60A5FA` dark)** — 주 행동 색. 버튼(primary variant), 활성 사이드바 항목, 링크, 입력 포커스 링, 단계형 폼 활성 인디케이터. shadcn의 `primary` 토큰을 대체한다.
- **Sky Accent (`#0EA5E9` light / `#38BDF8` dark)** — 보조 강조. 관제판 헤더, 키 수치 하이라이트, 모바일 하단 탭 활성 아이콘. `accent` 토큰을 대체한다. Primary와 혼용하지 않는다.
- **Warning Amber (`#F59E0B` light / `#FBBF24` dark)** — shadcn에 없는 추가 시맨틱 토큰. 이상 신호 중 경고 등급(매출차액, 이익률 급락)에 사용. Destructive(빨강)는 심각 등급(재고/손실 이상)에만 쓴다.
- **나머지 모든 토큰** (`background`, `foreground`, `muted`, `muted-foreground`, `border`, `input`, `ring`, `card`, `popover`, `destructive`) — shadcn 기본값 그대로. 변경 금지.

이상 신호는 색상 단독으로 의미를 전달하지 않는다. 항상 아이콘 또는 레이블과 함께 쓴다.

## Typography

body / label / caption / code 는 shadcn 기본 타이포그래피 램프를 상속한다. 별도 display 폰트 오버라이드 없음. 한국어 렌더링을 위해 body font-family 에 `"Apple SD Gothic Neo", "Noto Sans KR"` fallback을 추가한다.

**숫자 데이터**는 `font-variant-numeric: tabular-nums` 를 반드시 적용한다. 관제판 매출 수치, 재고 금액, 이익률 컬럼 모두 해당된다. 값이 자리 변환 없이 정렬되어야 한다.

## Layout & Spacing

shadcn / Tailwind 4px 기반 스케일 상속. 제품 고유 규칙:

- **데스크탑 사이드바 폭:** 240px (collapsed: 56px)
- **관제판 최대 콘텐츠 폭:** `max-w-6xl` (1152px) — 테이블 형 대시보드는 넓게 쓴다.
- **장부 입력 최대 콘텐츠 폭:** `max-w-2xl` (672px) — 단계형 폼은 집중 가능한 폭으로 제한.
- **재고 테이블 셀 패딩:** `py-2 px-3` — 30개 이상 행을 한 화면에 최대한 담는다.
- **모바일 하단 탭 바 높이:** 56px (safe-area-inset-bottom 추가).

## Elevation & Depth

shadcn 기본 shadow 상속. 제품은 elevation을 계층 장치로 쓰지 않는다. Sheet(슬라이드오버), Dialog, Popover는 shadcn의 overlay 표준을 그대로 따른다.

## Shapes

shadcn 기본보다 약간 sharp: `sm` 4px / `md` 6px / `lg` 8px. 배지와 신호 칩만 `full`(pill). 업무 도구는 consumer 앱보다 각지게 읽힌다.

## Components

ERP Fish는 아래 shadcn 컴포넌트를 **변경 없이** 사용한다: `Button`, `Card`, `Dialog`, `Sheet`, `Tabs`, `Table`, `Input`, `Select`, `Checkbox`, `Separator`, `Skeleton`, `Toast`, `DropdownMenu`, `Avatar`, `Popover`, `Command`. 이 컴포넌트들은 커스터마이징 금지.

브랜드 레이어 오버라이드 컴포넌트:

- **Badge (상태 배지)** — 장부 상태 4종(본사마감·검토대기·입력중·미입력)과 휴무 1종. 각각 고유 색상+레이블 조합. pill 형태(`{rounded.full}`). 텍스트만, 아이콘 없음.
- **Signal Chip (이상 신호 칩)** — 관제판 행 내 이상 신호 표시. 아이콘(경고 삼각형 또는 원) + 짧은 레이블. 색상만으로 의미 전달 금지. 같은 행에 복수 표시 가능.
- **Dashboard Row (관제판 행)** — shadcn `Table` 행 래퍼. 호버 시 `bg-muted/50`. 이상 신호 있는 행은 좌측 컬러 보더. 클릭 가능 전체 행(포인터 커서).
- **Inventory Row Modified (수정된 재고 행)** — 전일 이월값에서 수정된 재고 행. 연파란 배경 + 좌측 primary 보더. 신규 추가 품목은 연초록.
- **Step Indicator (단계 진행 표시기)** — 단계형 장부 입력 폼 상단. 완료·현재·대기 3상태를 아이콘+레이블로 표시.

## Do's and Don'ts

| Do | Don't |
|---|---|
| shadcn 기본 토큰은 `primary`, `accent`, `warning` 외 변경하지 않는다 | destructive 색상을 경고 등급에 남용한다 |
| 이상 신호는 아이콘 + 레이블로 표시한다 | 색상만으로 이상 신호를 구분한다 |
| 숫자 컬럼은 `tabular-nums`를 적용한다 | 비례 폭 숫자 폰트로 금액 컬럼을 표시한다 |
| 관제판은 `max-w-6xl`, 폼은 `max-w-2xl`로 폭을 분리한다 | 모든 화면에 동일한 최대 폭을 적용한다 |
| Warning(amber)은 매출차액·이익률 급락에, destructive(red)는 재고·손실 이상에 쓴다 | 두 등급을 혼용한다 |
| 모바일 재고 행은 터치 타겟 최소 44px를 확보한다 | 데스크탑용 narrow 셀을 모바일에 그대로 쓴다 |
| 배지는 pill 형태, 나머지는 `{rounded.md}` | 배지 외 요소에 pill을 적용한다 |
