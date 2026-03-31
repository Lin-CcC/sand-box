# Material Package Visibility Toggle (Public / Private)

Date: 2026-03-31  
Scope: Global “My Material Packages” explorer (局外素材库 / 我的素材包)  
Repo: `J:\code\tuan-chat-sandbox`

## Background (from PRD)

- Global material packages (局外素材包) are user-owned and **default public** (`visibility=1`). When public, they **can appear in the Material Square (素材广场)**. When private (`visibility=0`), they should not appear in square. (`material_package_PRD.md`)
- Backend data model already defines `visibility smallint not null default 1` with meaning `0=私有, 1=公开`, plus an index on `(visibility, update_time desc)`. (`material_package_PRD.md`)

## Goal

In the left “My Material Packages” tree (global packages list), show a per-package label for **Public / Private** and provide an in-place UI to change it.

Success criteria:

- Each top-level package row shows its current visibility at a glance.
- Changing visibility is possible without leaving the explorer.
- Switching to **Public** clearly communicates “this will publish to Material Square”.
- Switching to **Private** clearly communicates “this will unpublish from Material Square”.
- Works for both backend mode and mock mode.
- Does not accidentally reorder the list; ordering behavior remains controlled by the existing “sort only on refresh / reopen” rule.

Non-goals:

- Editing visibility for space packages (局内素材包) — out of scope.
- Implementing the square UI or its query keys if not present — only ensure data flow correctness/invalidation hooks where applicable.

## Data & Semantics

- Use existing `MaterialPackageRecord.visibility` (`0 | 1`) as source of truth.
- Definition:
  - `visibility=1 (公开)`: package is eligible to appear in `/materialPackage/square`（发布到素材广场）.
  - `visibility=0 (私有)`: package should not appear in square（从素材广场下架 / 不在素材广场展示）.
- Creation default stays **public** (existing behavior already sends `visibility: 1` on create in UI).
- Legacy/edge case: if `visibility` is missing/invalid in payload, treat it as `1 (公开)` for display (matches “默认公开”的 PRD 约束).
  - Write-back rule: do not “auto修正”后端数据；只有当用户在弹窗里明确保存时，才会写入 `visibility`。

## UX / UI Design (Approach A)

### Placement

- In `MaterialPackageNavPanel` top-level package rows, render a compact chip on the right:
  - Public: label `公开` (and optionally a “globe” icon)
  - Private: label `私有` (and optionally a “lock” icon)
- The chip is **always visible** (not hover-only), because this is a publish state.

### Interaction

- Clicking the chip opens a small anchored popover (style aligned with the preview annotations editor):
  - Title: `可见性`
  - Current state + short explanation
- Two radio options or a toggle:
    - `公开（发布到素材广场）`
    - `私有（从素材广场下架 / 不在素材广场展示）`
  - Primary action: `保存`
  - Secondary: `取消`
- Confirmation rule:
  - Saving to either state requires explicit click on `保存` (prevents misclick).
  - If state unchanged, `保存` is disabled.

### Loading / Error

- While saving: disable controls and show subtle “保存中…” state.
- On error: show `window.alert` with error text (consistent with existing toolbar flows).

## Implementation Notes

### Backend mode

- Call `updateMaterialPackage({ packageId, visibility })`.
- Update React Query cache:
  - Update detail query (`buildMaterialPackageDetailQueryKey`) if present.
  - Update my-list query (`buildMaterialPackageMyQueryKey`) by replacing the updated record **in-place** (preserve array order to avoid reorder jitter).
  - Do **not** auto-refetch my-list; user-triggered refresh/reopen remains the only “resort + refetch” mechanism.
  - Error rule: do not apply any optimistic cache update; only update cache after API success (prevents rollback complexity).
- Material Square sync:
  - Safety-first: on `公开 -> 私有`, eagerly remove the package from any in-memory square caches (if they exist), then optionally invalidate.
  - On `私有 -> 公开`, prefer invalidating square queries (ordering/pagination rules are server-defined).
  - If no square query keys exist yet in this repo, keep this as a future hook point.
  - Concrete key matching (if/when square queries exist): treat any query whose key prefix matches `["materialPackage", "square", ...]` as square data (invalidate/remove by predicate, not a single hard-coded key).

### Mock mode

- Update the in-storage list record’s `visibility`.
- Update `updateTime` to now (consistent with other mutations), but **do not trigger auto resort**; sorting only happens on refresh/reopen.

### Tests

- Add a unit test for the visibility chip rendering + interaction in mock mode (lightweight) OR keep as manual verification if the repo lacks React component tests for this panel.
- Existing typecheck and targeted vitest suite must keep passing.

## Manual Verification Checklist

- In mock mode: create multiple packages, toggle one to private, ensure chip updates and list order does not jump until refresh/reopen.
- In backend mode: toggle visibility, refresh page, ensure state persists.
- If square page exists: make a package private and confirm it disappears from square after refresh (or after invalidation-driven refetch).

## UI Safety / Accessibility Notes

- Chip click must `stopPropagation` to avoid triggering row click behaviors.
- Popover behavior:
  - Focus moves into popover on open; `Esc` and click-away close it.
  - On close, focus returns to the triggering chip.
  - While saving, disable controls and prevent duplicate submits.
- Accessibility:
  - Chip is a real `<button>` (keyboard activate via Enter/Space) with clear `aria-label` describing current state.
  - Use a labeled radio group (`role="radiogroup"` or native inputs + `<fieldset>/<legend>`).
  - “保存中…” state is reflected on the Save button (disabled + loading text) and announced via accessible text where feasible.
