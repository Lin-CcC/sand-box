# Material Batch Send + Persistent Reorder Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在局内素材库支持“文件夹递归批量发送 + 多选发送队列（序号只在队列显示）”，并在局内素材库与我的素材包支持“同文件夹内拖拽重排并持久化（folder/material 均可）”。

**Architecture:** 通过新增“批量拖拽 payload”与“payload 展开为 material 列表”的纯函数工具，统一 Chat drop 行为；重排通过 `draftReorderNode` 修改 `MaterialPackageContent` 的 siblings 数组并保存到后端/mock。UI 上用“插入线”区分 reorder，用“folder 高亮”表示 move。

**Tech Stack:** React + TypeScript + Tailwind v4 + Vitest + TanStack Query + Zustand + HTML5 Drag&Drop

---

## Files / Ownership

**Create**
- `material-package-nav/tuan-chat-web-main/app/components/chat/materialPackage/materialPackageDndBatch.ts`（批量拖拽 payload）
- `material-package-nav/tuan-chat-web-main/app/components/chat/materialPackage/materialPackageSendUtils.test.ts`（发送展开相关测试）

**Modify**
- `material-package-nav/tuan-chat-web-main/app/components/chat/materialPackage/materialPackageDraft.ts`（新增重排 draft）
- `material-package-nav/tuan-chat-web-main/app/components/chat/materialPackage/materialPackageDraft.test.ts`（重排测试）
- `material-package-nav/tuan-chat-web-main/app/components/chat/materialPackage/materialPackageSendUtils.ts`（展开为 material 列表 + 计算 messagesTotal）
- `material-package-nav/tuan-chat-web-main/app/components/chat/stores/materialSendTrayStore.ts`（支持批量入队/替换队列/打开）
- `material-package-nav/tuan-chat-web-main/app/components/chat/materialPackage/materialSendTray.tsx`（接入批量入队，toast/文案微调）
- `material-package-nav/tuan-chat-web-main/app/components/chat/chatFrameList.tsx`（房间消息区 drop：直发/阈值入队/多选入队）
- `material-package-nav/tuan-chat-web-main/app/components/chat/room/roomSidebarRoomItem.tsx`（房间列表 drop：同上）
- `material-package-nav/tuan-chat-web-main/app/components/chat/materialPackage/spaceMaterialLibraryPanel.tsx`（多选 + 批量拖拽 + 重排插入线 + 持久化）
- `material-package-nav/tuan-chat-web-main/app/components/chat/materialPackage/materialPackageNavPanel.tsx`（我的素材包：重排插入线 + 持久化）

---

## Chunk 1: Draft 重排（纯逻辑）

### Task 1: `draftReorderNode`（RED）

**Files**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/materialPackage/materialPackageDraft.test.ts`

- [ ] **Step 1: Write failing test**
  - Case A：同一 folder 下 material 重排：`A,B,C` 把 `C` 插到 `A` 前 => `C,A,B`
  - Case B：同一 folder 下 folder 重排：`F1,M1,F2` 把 `F2` 插到 `F1` 前 => `F2,F1,M1`

- [ ] **Step 2: Run test (expect FAIL)**
  - Run: `pnpm -s vitest run app/components/chat/materialPackage/materialPackageDraft.test.ts`
  - Expected: 新增用例 FAIL（函数不存在或行为不符）

### Task 2: `draftReorderNode`（GREEN）

**Files**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/materialPackage/materialPackageDraft.ts`

- [ ] **Step 3: Implement minimal reorder**
  - API：`draftReorderNode(content, folderPath, source, dest)`，source/dest 用 `{ type, name }` + `insertBefore` 或 `toIndex`
  - 仅支持同一个 `folderPath` 内 reorder（不做跨 folder move）

- [ ] **Step 4: Run test (expect PASS)**
  - Run: `pnpm -s vitest run app/components/chat/materialPackage/materialPackageDraft.test.ts`

- [ ] **Step 5: Commit**
  - `git add ...; git commit -m "feat: add draft reorder for material tree"`

---

## Chunk 2: 发送展开与阈值逻辑（纯逻辑）

### Task 3: 展开 payload 为 material 列表（RED）

**Files**
- Create: `material-package-nav/tuan-chat-web-main/app/components/chat/materialPackage/materialPackageSendUtils.test.ts`

- [ ] **Step 1: Write failing tests**
  - `expandFolderToMaterials`：folder(含子 folder) 能按 siblings 顺序 DFS 展开成 material payload 列表
  - `countMessagesTotal`：展开后的 messagesTotal 计算正确

- [ ] **Step 2: Run test (expect FAIL)**
  - Run: `pnpm -s vitest run app/components/chat/materialPackage/materialPackageSendUtils.test.ts`

### Task 4: 展开实现（GREEN）

**Files**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/materialPackage/materialPackageSendUtils.ts`

- [ ] **Step 3: Implement**
  - 新增：`resolveMaterialPayloadsFromPayload(content, payload): MaterialPreviewPayload[]`（只返回 `kind:"material"`，保持 `scope/spaceId/packageId`）
  - 新增：`resolveMaterialMessageCountFromPayload(content, payload): number`

- [ ] **Step 4: Run tests (expect PASS)**
  - Run: `pnpm -s vitest run app/components/chat/materialPackage/materialPackageSendUtils.test.ts`

- [ ] **Step 5: Commit**
  - `git add ...; git commit -m "feat: expand material payloads for batch send"`

---

## Chunk 3: 批量拖拽 payload + SendTray 批量入队

### Task 5: 批量拖拽 DnD（RED/GREEN）

**Files**
- Create: `material-package-nav/tuan-chat-web-main/app/components/chat/materialPackage/materialPackageDndBatch.ts`

- [ ] **Step 1: Add minimal unit tests (optional)**
  - 仅在容易加的情况下加；否则通过集成行为验证

- [ ] **Step 2: Implement batch DnD helpers**
  - `setMaterialBatchDragData` / `getMaterialBatchDragData` / `isMaterialBatchDrag`

### Task 6: SendTray store 支持批量入队

**Files**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/stores/materialSendTrayStore.ts`

- [ ] **Step 1: Add API**
  - `enqueueMany(payloads)`
  - `replace(payloads)`
  - `open()`（已有）+ 在 enqueueMany/replace 时自动打开

- [ ] **Step 2: Commit**
  - `git add ...; git commit -m "feat: support enqueueMany for material send tray"`

---

## Chunk 4: Room drop 行为（直发 vs 队列）

### Task 7: ChatFrameList drop

**Files**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/chatFrameList.tsx`

- [ ] **Step 1: 支持 batch drag => 入队显示**
- [ ] **Step 2: 单 material/folder drop => 直发**
  - folder 若 `messagesTotal > 10`：展开为 materials 入队（不直接发送）
  - material：直接发送（逐条或后端单条）

### Task 8: RoomSidebarRoomItem drop

**Files**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/room/roomSidebarRoomItem.tsx`

- [ ] **Step 1: 与 ChatFrameList 保持一致逻辑**

- [ ] **Step 2: Commit**
  - `git add ...; git commit -m "feat: batch send via dnd with threshold"`

---

## Chunk 5: Space 面板多选 + 重排持久化

### Task 9: Space 多选与批量拖拽

**Files**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/materialPackage/spaceMaterialLibraryPanel.tsx`

- [ ] **Step 1: material 行支持 Ctrl/⌘ 多选**
- [ ] **Step 2: dragStart 若存在多选 => 写入 batch DnD payload**
  - payloads 按当前 visible 列表顺序排序

### Task 10: Space 重排（插入线）+ 持久化

**Files**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/materialPackage/spaceMaterialLibraryPanel.tsx`

- [ ] **Step 1: dragover 计算“插入到上方”命中区**
- [ ] **Step 2: drop 执行 `draftReorderNode` 并 `savePackageContent`**
- [ ] **Step 3: 视觉反馈区分 reorder vs move**

- [ ] **Step 4: Commit**
  - `git add ...; git commit -m "feat: space material reorder and multiselect dnd"`

---

## Chunk 6: Global（我的素材包）重排持久化

### Task 11: Global 重排（插入线）+ 持久化

**Files**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/materialPackage/materialPackageNavPanel.tsx`

- [ ] **Step 1: 在 folder/material 行增加 reorder drop 命中区**
- [ ] **Step 2: drop 后读取 package content，`draftReorderNode`，并 `savePackageContent`**
- [ ] **Step 3: 仅同一父 folder 内重排；跨 folder 提示并取消**

- [ ] **Step 4: Commit**
  - `git add ...; git commit -m "feat: global material package reorder persist"`

---

## Final Verification

- [ ] `pnpm -s vitest run app/components/chat/materialPackage/materialPackageDraft.test.ts app/components/chat/materialPackage/materialPackageSendUtils.test.ts`
- [ ] `pnpm -s typecheck`

