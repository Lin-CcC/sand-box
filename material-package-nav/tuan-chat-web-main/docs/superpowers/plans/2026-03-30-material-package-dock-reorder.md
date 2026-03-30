# Material Package Dock Reorder Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在素材包沙盒里，嵌入预览可在左侧目录“可见列表”任意位置插入/调整顺序，并支持拖出目录恢复为自由浮窗。

**Architecture:** 将目录树渲染改为“扁平化可见列表”，并把嵌入预览作为一个特殊行插入到列表的 `dockedIndex`。拖拽时按鼠标 Y 计算插入 index，drop 时更新 `dockedIndex`；拖到主区域 drop 时 undock 并 open 浮窗。

**Tech Stack:** React + React Router + Vite + Tailwind CSS v4（项目现有），HTML5 drag&drop。

---

## Chunk 1: Dock 行插入与拖拽排序

### Task 1: 抽出可见列表生成器

**Files:**
- Modify: `app/components/chat/materialPackage/materialPackageNavPanel.tsx`

- [ ] 定义 `VisibleItem` 类型（folder/material/package header 等），包含 `key`、`depth`、`payload?`、`kind`。
- [ ] 将当前递归渲染改为：先构建 `visibleItems: VisibleItem[]`，再统一 `map` 渲染。
- [ ] 保持现有折叠逻辑（`collapsedByKey`）不变，只改变渲染形态。

### Task 2: 将嵌入预览作为可见列表的一行

**Files:**
- Modify: `app/components/chat/materialPackage/materialPackageNavPanel.tsx`

- [ ] 用 `dockedIndex`（0..N）代替 `dockedPlacement`（top/bottom）来控制插入位置。
- [ ] 在 `visibleItems` 中插入 `kind: "dockPreview"` 的特殊 item。
- [ ] 将 `OPEN PREVIEWS` 区域删除或只保留标题（不再单独渲染 embedded 预览）。
- [ ] embedded 预览行包含：`MaterialPreviewFloat variant="embedded"` + “拖拽把手/整行可拖拽” + “弹出/关闭”。

### Task 3: 支持拖入任意位置（文件夹之间）

**Files:**
- Modify: `app/components/chat/materialPackage/materialPackageNavPanel.tsx`

- [ ] 新增 `computeInsertIndex(clientY)`：基于列表中每个 row 的 `getBoundingClientRect()` 计算插入到哪一行之前（0..N）。
- [ ] `onDragOverCapture`：如果是预览拖拽（`isMaterialPreviewDrag`），计算并显示插入线（基于 index）。
- [ ] `onDropCapture`：读取 payload，`onDockPreview(payload, { index })`。
- [ ] 插入提示文案复用现有样式（仍显示“插入到这里（i/N）”之类），但依据 index 而不是 top/bottom。

### Task 4: 嵌入后可随意调整位置、可拖出目录

**Files:**
- Modify: `app/components/chat/materialPackage/materialPackageNavPanel.tsx`
- Modify: `app/components/chat/materialPackage/materialPackagePage.tsx`

- [ ] 让嵌入行 `draggable`：
  - 在 dock 区内拖动时走同一套 `computeInsertIndex` 更新 `dockedIndex`（相当于排序）。
  - 拖到主区域 drop 时：`onUndockPreview()` + `onOpenPreview(payload, hintPos)`（恢复自由浮窗）。
- [ ] 主区域 `onDrop` 增强：若拖入的是“当前 dockedPreview”且来源为 docked 行，执行“拖出目录”逻辑。

---

## Chunk 2: 验证与回归

### Task 5: 类型检查与手动验证

**Files:**
- Test: N/A（该仓库无 git，建议只做 `typecheck` + 手动交互回归）

- [ ] Run: `pnpm typecheck`（Expected: exit code 0）
- [ ] 手动回归：
  - 拖入 dock 区：能插在任意两行之间（文件夹/素材之间）。
  - 嵌入后拖动：能在列表中任意位置移动。
  - 拖出 dock 区到右侧：恢复为自由浮窗。
  - 折叠/展开：插入位置随“可见列表”变化是允许的（预期行为）。

