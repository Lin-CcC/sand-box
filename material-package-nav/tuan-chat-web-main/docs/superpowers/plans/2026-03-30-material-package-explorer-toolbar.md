# Material Package Explorer Toolbar Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a VSCode-like toolbar to the left “我的素材包” explorer (`MaterialPackageNavPanel`) that can create packages/folders/files, import local files with conflict handling, refresh, and reveal selection with deterministic target-resolution rules.

**Architecture:** Implement the toolbar and dialogs inside `MaterialPackageNavPanel` and reuse existing draft mutation helpers (`materialPackageDraft.ts`) to produce next `content`. Persist changes via existing backend APIs (`createMaterialPackage`/`updateMaterialPackage`) or mock storage (`writeMockPackages`) while keeping React Query caches in sync.

**Tech Stack:** React + TypeScript, TanStack React Query, DaisyUI modal styles, Vitest.

---

## Files & Responsibilities

- Modify: `app/components/chat/materialPackage/materialPackageNavPanel.tsx`
  - UI: toolbar on `TUAN-CHAT` row (hover-to-show)
  - State: tree selection + “default target package”
  - Dialogs: Choose Package, Import Conflicts
  - Actions: New File/Folder/Package, Import, Refresh, Reveal
- Modify: `app/components/chat/materialPackage/materialPackageDraft.ts`
  - Add a draft helper to overwrite an existing material’s messages (for “Overwrite” import mode)
- Test: `app/components/chat/materialPackage/materialPackageDraft.test.ts`
  - Add unit tests for the new overwrite draft helper
- Modify: `app/components/chat/materialPackage/materialPreviewFloat.tsx`
  - Backend-mode import placeholder: if media `url==""`, show a non-broken placeholder UI (per spec)

---

## Chunk 1: Tree selection + toolbar skeleton

### Task 1: Add selection state and row highlight

**Files:**
- Modify: `app/components/chat/materialPackage/materialPackageNavPanel.tsx`

- [ ] **Step 1: Add selected node state**
  - Add `selectedNode` state with enough info:
    - `kind: "package" | "folder" | "material"`
    - `key` (visible item key)
    - `payload` (already contains `packageId`, `path`, `label`)
  - Update each row’s `onClick` to set selection (do not change the existing double-click preview logic).

- [ ] **Step 2: Add selected row styling**
  - Add a selected background/border class on the row container when `selectedNode.key === item.key`.
  - Ensure selection does not break drag-and-drop.

- [ ] **Step 3: Quick manual check**
  - Run `pnpm -s typecheck`
  - Open the app and confirm: single click highlights; double click still opens preview.

- [ ] **Step 4: Commit**
  - `git add app/components/chat/materialPackage/materialPackageNavPanel.tsx`
  - `git commit -m "feat: add explorer selection state"`

### Task 2: Add toolbar UI on `TUAN-CHAT` row (hover-to-show)

**Files:**
- Modify: `app/components/chat/materialPackage/materialPackageNavPanel.tsx`

- [ ] **Step 1: Replace the `TUAN-CHAT` label line with a flex row**
  - Keep the text on the left.
  - Add an icon button group on the right.

- [ ] **Step 2: Implement “VSCode-like” visibility**
  - Buttons are low-emphasis by default and become fully visible on hover of the row.
  - Use `PortalTooltip` tooltips for each action.

- [ ] **Step 3: Wire buttons to placeholders**
  - Handlers exist but `console.log` or `alert("TODO")` for now.

- [ ] **Step 4: Typecheck**
  - Run `pnpm -s typecheck`

- [ ] **Step 5: Commit**
  - `git add app/components/chat/materialPackage/materialPackageNavPanel.tsx`
  - `git commit -m "feat: add explorer TUAN-CHAT toolbar shell"`

---

## Chunk 2: Target resolution + dialogs

### Task 3: Implement “default target package” + target resolution rules

**Files:**
- Modify: `app/components/chat/materialPackage/materialPackageNavPanel.tsx`

- [ ] **Step 1: Add `defaultTargetPackageId` state**
  - Session-only; resets on reload.
  - Update it when:
    - user confirms Choose Package dialog
    - (optional per spec recommendation) user explicitly selects a package/folder/material row

- [ ] **Step 2: Add a helper to compute target**
  - Given `(selectedNode, packages, defaultTargetPackageId)` return:
    - `packageId`
    - `folderPath: string[]` (folder names only, for draft functions)
  - Convert from `payload.path` segments like `folder:xxx` / `material:yyy`.

- [ ] **Step 3: Package-count==0 disabled behavior**
  - Disable New File / New Folder / Import / Reveal with tooltip.

- [ ] **Step 4: Typecheck**
  - Run `pnpm -s typecheck`

- [ ] **Step 5: Commit**
  - `git add app/components/chat/materialPackage/materialPackageNavPanel.tsx`
  - `git commit -m "feat: add explorer target resolution"`

### Task 4: Choose Package dialog (multi packages + no selection)

**Files:**
- Modify: `app/components/chat/materialPackage/materialPackageNavPanel.tsx`

- [ ] **Step 1: Add dialog state**
  - `isChoosePackageOpen`
  - `pendingAction: "newFile" | "newFolder" | "import" | null`
  - `pendingPayload` (store whatever the action needs after choosing)
  - `chosenPackageId` (local selection inside dialog)

- [ ] **Step 2: Build modal UI**
  - DaisyUI `<dialog className="modal modal-open">` pattern (see `app/components/aiImage/MetadataImportDialog.tsx`).
  - List package names; click selects.
  - Buttons: `确定` / `取消` (Cancel aborts action).

- [ ] **Step 3: Integrate**
  - When an action requires a package but target can’t be resolved:
    - if packages.length > 1 => open Choose Package dialog
    - on confirm => set `defaultTargetPackageId`, resume pending action

- [ ] **Step 4: Typecheck**
  - Run `pnpm -s typecheck`

- [ ] **Step 5: Commit**
  - `git add app/components/chat/materialPackage/materialPackageNavPanel.tsx`
  - `git commit -m \"feat: add choose-package dialog for explorer actions\"`

---

## Chunk 3: Implement actions (create/import/refresh/reveal)

### Task 5: Persist helpers for backend + mock (nav panel)

**Files:**
- Modify: `app/components/chat/materialPackage/materialPackageNavPanel.tsx`

- [ ] **Step 1: Add `useQueryClient` usage**
  - Ensure we can update list query cache after mutations.

- [ ] **Step 2: Implement `savePackageRecord` for mock**
  - Similar to `saveMockRecord` in `app/components/chat/materialPackage/materialPreviewFloat.tsx`.
  - Update local storage via `writeMockPackages`.
  - Update React Query cache for the list query key.

- [ ] **Step 3: Implement `savePackageContent`**
  - Backend mode: call `updateMaterialPackage({ packageId, content })`, then invalidate list query.
  - Mock mode: call `savePackageRecord({ ...record, content })`.

- [ ] **Step 4: Typecheck + commit**
  - `pnpm -s typecheck`
  - Commit.

### Task 6: New Package action

**Files:**
- Modify: `app/components/chat/materialPackage/materialPackageNavPanel.tsx`

- [ ] **Step 1: Name prompt**
  - Use `window.prompt("输入素材箱名称", \`素材箱 ${packages.length + 1}\`)`.
  - If name collides, auto-rename with ` (1)` etc (VSCode-like).

- [ ] **Step 2: Create**
  - Backend: `createMaterialPackage({ name, content: buildEmptyMaterialPackageContent() })`
  - Mock: append to list and `writeMockPackages`

- [ ] **Step 3: Post-create UX**
  - Ensure the new package row is expanded (set its `root:${id}` collapsed state to `false`).
  - Select it and scroll it into view.

- [ ] **Step 4: Typecheck + commit**

### Task 7: New Folder + New File actions

**Files:**
- Modify: `app/components/chat/materialPackage/materialPackageNavPanel.tsx`

- [ ] **Step 1: Resolve target**
  - Use the target-resolution helper.
  - If still unresolved => Choose Package dialog.

- [ ] **Step 2: Prompt name**
  - New Folder default: `新文件夹`
  - New File default: `新文件.txt` (user can edit extension to anything)

- [ ] **Step 3: Uniqueness**
  - If sibling name exists, auto-rename using the algorithm:
    - `foo.txt` → `foo (1).txt`
    - `foo` → `foo (1)`

- [ ] **Step 4: Draft mutations**
  - Folder: `draftCreateFolder(content, folderPath, name)`
  - File: `draftCreateMaterial(content, folderPath, { type:\"material\", name, note:\"\", messages: [] })`

- [ ] **Step 5: Save + post-create reveal**
  - Save via `savePackageContent`.
  - Expand ancestors + scroll to the new node.

- [ ] **Step 6: Typecheck + commit**

### Task 8: Import Local action (including conflicts)

**Files:**
- Modify: `app/components/chat/materialPackage/materialPackageNavPanel.tsx`
- Modify: `app/components/chat/materialPackage/materialPackageDraft.ts`
- Test: `app/components/chat/materialPackage/materialPackageDraft.test.ts`
- Modify: `app/components/chat/materialPackage/materialPreviewFloat.tsx`

- [ ] **Step 1: Add a hidden `<input type=\"file\" multiple>` in nav panel**
  - Accept same list as preview float.
  - Button “Import Local” triggers `.click()` and clears `.value`.

- [ ] **Step 2: Build import mapping (reuse preview behavior)**
  - Image/audio/text/other mapping matches `handleImportChange` in `MaterialPreviewFloat`.
  - Backend mode sets media url to `\"\"`.

- [ ] **Step 3: Detect conflicts**
  - Gather existing sibling material names at target folder.
  - Also detect duplicates inside the selected file list.
  - If no conflicts: import directly.
  - If conflicts: open Import Conflicts modal (Overwrite / Auto Rename / Cancel).

- [ ] **Step 4: Implement overwrite draft helper**
  - Add `draftReplaceMaterialMessages(content, folderPath, materialName, nextMessages)`:
    - replace `messages`
    - preserve `name` + `note`
  - Add unit tests in `materialPackageDraft.test.ts`:
    - overwrite updates messages and preserves note
    - overwrite no-ops when name not found

- [ ] **Step 5: Apply chosen strategy**
  - Overwrite:
    - for each conflicting file: call `draftReplaceMaterialMessages(...)`
  - Auto Rename:
    - compute unique names against (existing names + already-assigned names in this batch)
    - create new materials via `draftCreateMaterial`

- [ ] **Step 6: Save + reveal**
  - Save via `savePackageContent`
  - Reveal the last imported node (or the first; pick one and keep deterministic).

- [ ] **Step 7: Backend-mode placeholder UI in preview float**
  - Update `MaterialPreviewFloat` thumbnail rendering:
    - if `imageMessage.url==\"\"` or `soundMessage.url==\"\"`, show placeholder and hint “未上传（后端模式）”.

- [ ] **Step 8: Run tests**
  - `pnpm -s test app/components/chat/materialPackage/materialPackageDraft.test.ts`
  - Expected: PASS

- [ ] **Step 9: Typecheck + commit**
  - `pnpm -s typecheck`
  - Commit.

### Task 9: Refresh action

**Files:**
- Modify: `app/components/chat/materialPackage/materialPackageNavPanel.tsx`

- [ ] **Step 1: Invalidate list query**
  - Use `queryClient.invalidateQueries({ queryKey: buildMaterialPackageMyQueryKey(useBackend) })`.

- [ ] **Step 2: Typecheck + commit**

### Task 10: Reveal/Expand Selection action

**Files:**
- Modify: `app/components/chat/materialPackage/materialPackageNavPanel.tsx`

- [ ] **Step 1: Expand ancestors**
  - For selected folder/material: expand `root:${packageId}` and each folder prefix key in `collapsedByKey` (set to `false`).

- [ ] **Step 2: Scroll into view**
  - Add a `data-node-key={item.key}` attribute on each visible row.
  - Use `treeItemsRef.current?.querySelector([data-node-key=\"...\"])?.scrollIntoView({ block: \"nearest\" })`.

- [ ] **Step 3: No-selection behavior**
  - If `defaultTargetPackageId` exists: reveal that package.
  - Else: show toast/hint “请先选择一个素材箱或目录” (fallback to `alert` if no toast infra).

- [ ] **Step 4: Typecheck + commit**

---

## Final Verification

- [ ] Run `pnpm -s typecheck`
- [ ] Run `pnpm -s test`
- [ ] Manual smoke:
  - Multi-package: create file/folder prompts Choose Package when nothing selected.
  - Import with conflicts shows modal; Overwrite preserves note and position; Auto Rename inserts suffix before extension.
  - Backend mode import shows placeholder rather than broken image/audio.
  - Refresh refetches list.
  - Reveal expands and scrolls correctly.

