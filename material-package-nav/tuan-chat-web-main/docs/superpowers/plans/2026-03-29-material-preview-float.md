# Material Preview Float Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/chat/material-package` 右侧“预览浮窗”尽量还原 `yuanxingtu/material_package_detail.html` 的布局与样式，并让工具条按钮（新增包/新建文件夹/导入/删除/重命名等）都真正可用（mock 可完整验收，后端尽量对接接口）。

**Architecture:** 以 `MaterialPreviewFloat` 为容器拆成 5 块 UI（Tabs / 面包屑 / Toolbar / Assets / Footer）。目录/素材的增删改统一走“修改 `content` 树 + 保存（mock: localStorage；backend: PUT /materialPackage）”，并用 React Query 更新缓存以联动左侧资源管理器。

**Tech Stack:** React、TypeScript、Tailwind（DaisyUI/项目现有 `bg-base-*`）、@tanstack/react-query、Phosphor Icons、vitest

---

## File Structure

**Modify:**
- `app/components/chat/materialPackage/materialPreviewFloat.tsx`（重做布局/样式 + 全量交互）
- `app/components/chat/materialPackage/materialPackageNavPanel.tsx`（如需联动刷新/更新 query cache 的键）
- `app/components/materialPackage/materialPackageApi.ts`（补充/复用更新接口；或新增轻量 mutation helper）

**Create:**
- `app/components/chat/materialPackage/materialPackageDraft.ts`（纯函数：对 `MaterialPackageContent` 做增删改的 tree 操作）
- `app/components/chat/materialPackage/materialPackageMockStore.ts`（mock 模式持久化：localStorage 读写 + 默认数据兜底）
- `app/components/chat/materialPackage/materialPackageDraft.test.ts`（tree 操作单测）
- `app/components/chat/materialPackage/materialPackageMockStore.test.ts`（持久化单测：读写/回退）

---

## Chunk 1: 数据层（mock 持久化 + tree 操作）

### Task 1: 定义 tree 操作接口（纯函数）

**Files:**
- Create: `app/components/chat/materialPackage/materialPackageDraft.ts`
- Test: `app/components/chat/materialPackage/materialPackageDraft.test.ts`

- [ ] **Step 1: 写 failing tests（最小覆盖）**
  - [ ] 在 root 添加 folder
  - [ ] 在某 folder 添加 material
  - [ ] rename folder / material（material 还要支持 note）
  - [ ] delete folder（递归删除）
  - [ ] delete material
  - [ ] path 解析：使用现有 `folderPath: string[]`（以“folder name path”为主，满足当前 mock 结构）

- [ ] **Step 2: 运行测试验证 fail**
  - Run: `pnpm -s vitest run app/components/chat/materialPackage/materialPackageDraft.test.ts`
  - Expected: FAIL（函数未实现）

- [ ] **Step 3: 实现最小可用的 tree 操作**
  - 输出：对传入 `MaterialPackageContent` 做不可变更新（深拷贝必要路径），返回新 content
  - 提供辅助：`getFolderAtPath(content, folderPath)`（仅内部用）

- [ ] **Step 4: 运行测试验证 pass**
  - Run: `pnpm -s vitest run app/components/chat/materialPackage/materialPackageDraft.test.ts`
  - Expected: PASS

### Task 2: mock 持久化（localStorage）

**Files:**
- Create: `app/components/chat/materialPackage/materialPackageMockStore.ts`
- Test: `app/components/chat/materialPackage/materialPackageMockStore.test.ts`
- Modify (optional): `app/components/chat/materialPackage/materialPackageMock.ts`（保留作为默认种子数据）

- [ ] **Step 1: 写 failing tests**
  - [ ] 初次读取：localStorage 空 -> 返回 seed（`getMockMyMaterialPackages()`）
  - [ ] 保存后读取：返回保存内容
  - [ ] 数据损坏：JSON parse fail -> 回退 seed

- [ ] **Step 2: 运行测试验证 fail**
  - Run: `pnpm -s vitest run app/components/chat/materialPackage/materialPackageMockStore.test.ts`

- [ ] **Step 3: 实现 store**
  - `readMockPackages()` / `writeMockPackages(next)`
  - key：`tc:material-package:mock-packages:v1`

- [ ] **Step 4: 运行测试验证 pass**
  - Run: `pnpm -s vitest run app/components/chat/materialPackage/materialPackageMockStore.test.ts`

---

## Chunk 2: UI 还原（布局 + 样式）

### Task 3: 重排 `MaterialPreviewFloat` 结构贴近原型

**Files:**
- Modify: `app/components/chat/materialPackage/materialPreviewFloat.tsx`

- [ ] **Step 1: 先只改结构不改行为**
  - Tabs（项目/素材箱）
  - 面包屑行（返回/回根/路径/统计）
  - Toolbar（搜索、pack select、按钮组）
  - Panel（资产区容器）
  - Footer（缩略图 slider）

- [ ] **Step 2: 调整配色/边框/间距以贴近原型**
  - 目标：整体更“紧凑”、更硬朗的线条（但仍使用项目 `bg-base-*`）
  - 浮窗容器与分隔线：对齐原型的“多条细线”感觉

- [ ] **Step 3: 视觉验收（手动）**
  - Run: `pnpm dev -- -m test`
  - 验证：浮窗布局与 `yuanxingtu/material_package_detail.html` 基本一致

---

## Chunk 3: 交互实现（按钮全可用）

### Task 4: pack 选择 / 新增 pack / 删除 pack / 重命名 pack

**Files:**
- Modify: `app/components/chat/materialPackage/materialPreviewFloat.tsx`
- Modify (optional): `app/components/materialPackage/materialPackageApi.ts`

- [ ] **Step 1: pack-select（下拉）切换包**
  - mock：从 mock store 读 packages；切换 `selectedPackId`
  - backend：从 `getMyMaterialPackages()` 读 packages（已有 query），切换后加载 detail

- [ ] **Step 2: 新增素材包**
  - mock：`prompt` 输入 name -> 追加到 packages -> writeMockPackages -> 更新 query cache
  - backend：调用 `POST /materialPackage`（payload: name + content root 空）-> invalidate/refetch list

- [ ] **Step 3: 删除素材包**
  - mock：按当前包删除 -> writeMockPackages -> 若空则创建默认空包
  - backend：`DELETE /materialPackage/{packageId}` -> invalidate/refetch

- [ ] **Step 4: 重命名素材包**
  - mock：更新 name -> writeMockPackages
  - backend：`PUT /materialPackage`（只传 `packageId + name`）-> invalidate/refetch

### Task 5: 当前目录操作（新建文件夹 / 重命名 / 删除）

**Files:**
- Modify: `app/components/chat/materialPackage/materialPreviewFloat.tsx`
- Use: `app/components/chat/materialPackage/materialPackageDraft.ts`

- [ ] **Step 1: 新建文件夹**
  - `prompt` 输入 folder name；调用 draft -> 保存

- [ ] **Step 2: 重命名（按原型优先级）**
  - 选中 material：同时支持编辑 note（两次 prompt 或自定义弹层）
  - 选中 folder：rename
  - 无选中且非 root：rename 当前 folder

- [ ] **Step 3: 删除（按原型优先级）**
  - 选中 material / folder：delete
  - 无选中且非 root：delete 当前 folder

- [ ] **Step 4: 保存策略**
  - mock：写 localStorage + 更新 query cache，让左侧目录同步变化
  - backend：PUT 更新整个 `content`（必要时加轻量节流/防抖，避免频繁 PUT）

### Task 6: 导入素材（文件输入）

**Files:**
- Modify: `app/components/chat/materialPackage/materialPreviewFloat.tsx`
- Use: `app/components/chat/materialPackage/materialPackageDraft.ts`

- [ ] **Step 1: 增加隐藏 `<input type=file multiple>` 并绑定 toolbar 导入按钮**
- [ ] **Step 2: 解析文件类型并生成 material 节点**
  - 图片：`URL.createObjectURL(file)`（mock 模式可直接用），写入 `extra.imageMessage.url`
  - 音频：同理写入 `extra.soundMessage.url`
  - 文本：读取 `file.text()` 写入 `content`
- [ ] **Step 3: 保存并刷新资产区**

---

## Chunk 4: 视图与细节

### Task 7: icon/list 与 compact list

**Files:**
- Modify: `app/components/chat/materialPackage/materialPreviewFloat.tsx`

- [ ] **Step 1: icon/list 切换按钮样式与状态**
- [ ] **Step 2: list 视图实现表头/行**
- [ ] **Step 3: 监听浮窗宽度（ResizeObserver）**
  - ≤360px：进入 compact list（隐藏缩略图，仅 dot+文本）

### Task 8: 搜索/过滤、统计、面包屑显示

**Files:**
- Modify: `app/components/chat/materialPackage/materialPreviewFloat.tsx`

- [ ] **Step 1: 搜索过滤 name/note**
- [ ] **Step 2: 统计“已选/总数”**
- [ ] **Step 3: 路径显示省略（ellipsis）**

---

## Verification

- [ ] Typecheck: `pnpm -s typecheck`（Expected: exit 0）
- [ ] Unit tests:
  - `pnpm -s vitest run app/components/chat/materialPackage/materialPackageDraft.test.ts`
  - `pnpm -s vitest run app/components/chat/materialPackage/materialPackageMockStore.test.ts`
- [ ] Manual: `pnpm dev -- -m test`，按原型验收点逐条点/双击/导入/重命名/删除/切视图/缩略图大小/拖拽收纳

