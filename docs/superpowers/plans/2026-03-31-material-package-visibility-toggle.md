# Material Package Visibility Toggle Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-package “公开/私有” chip in the global “我的素材包” explorer and allow toggling `visibility` with an explicit save popover.

**Architecture:** Reuse existing `MaterialPackageRecord.visibility` as the publish state. Implement a small popover editor anchored to the chip in `MaterialPackageNavPanel`, and update React Query caches in-place to avoid list reorder jitter.

**Tech Stack:** React + TanStack Query, Tailwind/DaisyUI-style classes, Vitest.

---

## File Structure

**Create**
- `material-package-nav/tuan-chat-web-main/app/components/chat/materialPackage/materialPackageVisibility.ts` (visibility normalization + UI label helpers)
- `material-package-nav/tuan-chat-web-main/app/components/chat/materialPackage/materialPackageVisibility.test.ts` (unit tests for helpers)

**Modify**
- `material-package-nav/tuan-chat-web-main/app/components/chat/materialPackage/materialPackageNavPanel.tsx` (chip + popover UI; backend/mock save; cache updates)

## Chunk 1: Helpers + Tests

### Task 1: Add visibility helper module

**Files:**
- Create: `material-package-nav/tuan-chat-web-main/app/components/chat/materialPackage/materialPackageVisibility.ts`

- [ ] **Step 1: Write failing unit tests**

Create `material-package-nav/tuan-chat-web-main/app/components/chat/materialPackage/materialPackageVisibility.test.ts` with cases:
- `normalizePackageVisibility(0) => 0`
- `normalizePackageVisibility(1) => 1`
- invalid/missing (`undefined`, `null`, `"0"`) => `1`
- `toVisibilityChipText(0/1)` returns expected label text

- [ ] **Step 2: Run the new test to confirm FAIL**

Run: `cd J:\\code\\tuan-chat-sandbox\\material-package-nav\\tuan-chat-web-main; pnpm -s vitest run app/components/chat/materialPackage/materialPackageVisibility.test.ts`  
Expected: FAIL (module not found / functions missing)

- [ ] **Step 3: Implement minimal helpers**

Implement:
- `normalizePackageVisibility(value: unknown): 0 | 1`
- `getVisibilityCopy(visibility: 0 | 1): { chip: string; title: string; description: string }`

- [ ] **Step 4: Re-run test to confirm PASS**

Run: `pnpm -s vitest run app/components/chat/materialPackage/materialPackageVisibility.test.ts`  
Expected: PASS

## Chunk 2: Nav Panel UI + Save Flow + Verification

### Task 2: Render per-package chip in explorer rows

**Files:**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/materialPackage/materialPackageNavPanel.tsx`

- [ ] **Step 1: Add chip UI in `item.kind === "package"` row**
- [ ] **Step 2: Ensure chip click does not trigger row click (`stopPropagation`)**
- [ ] **Step 3: Show correct label based on `visibility` (default public when missing)**

### Task 3: Add anchored popover editor (explicit save)

**Files:**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/materialPackage/materialPackageNavPanel.tsx`

- [ ] **Step 1: Add state for popover open/close, target `packageId`, draft visibility, saving flag**
- [ ] **Step 2: Position popover near chip (fixed positioning, viewport clamped)**
- [ ] **Step 3: Implement close behaviors (Esc, click-away, close button)**
- [ ] **Step 4: Basic accessibility (chip is `<button>`, radios labeled, focus to popover on open + return on close)**

### Task 4: Implement save logic (backend + mock)

**Files:**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/materialPackage/materialPackageNavPanel.tsx`

- [ ] **Step 1: Backend save**
  - Call `updateMaterialPackage({ packageId, visibility })`
  - Update detail cache key: `buildMaterialPackageDetailQueryKey(packageId, useBackend)`
  - Update my-list cache key: `buildMaterialPackageMyQueryKey(useBackend)` by mapping and replacing the updated record **in-place** (preserve order)
  - Do not `invalidateQueries` for my-list (avoid auto reorder)
- [ ] **Step 2: Mock save**
  - Update local mock record `visibility` and set `updateTime` to now
  - Use existing `writeMockPackages` + `queryClient.setQueryData` to keep list and detail in sync
- [ ] **Step 3: Error handling**
  - On error: keep popover open, set saving false, show `window.alert`

### Task 5: Verify

**Files:**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/materialPackage/materialPackageNavPanel.tsx`
- Test: `material-package-nav/tuan-chat-web-main/app/components/chat/materialPackage/materialPackageVisibility.test.ts`

- [ ] **Step 1: Typecheck**

Run: `cd J:\\code\\tuan-chat-sandbox\\material-package-nav\\tuan-chat-web-main; pnpm -s typecheck`  
Expected: exit code 0

- [ ] **Step 2: Run targeted existing tests**

Run: `pnpm -s vitest run app/components/chat/materialPackage/materialPackageDraft.test.ts app/components/chat/materialPackage/materialPackageExplorerOps.test.ts app/components/chat/materialPackage/materialPackageVisibility.test.ts`  
Expected: PASS

- [ ] **Step 3: Manual UI smoke test**

Run: `pnpm dev -- -m test` then:
- Confirm chip shows on each top-level package row.
- Toggle a package to 私有 and confirm chip updates immediately without list reordering.
- Click “刷新” and confirm list may re-sort only then (existing behavior).

