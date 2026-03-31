# 素材包广场（Square）Implementation Plan

**Goal:** `/chat/material-package` 默认打开「素材包广场」，可浏览公开素材包并导入到当前 space；左侧目录树/工具栏能力保持不变。

**Architecture:** `/chat/material-package` 主区固定为 `MaterialPackageSquareView`；用 React Query 缓存 + 纯函数 cache helpers 做广场列表的就地同步；发现-广场顶部提供入口跳转到素材包广场。

---

## Done (as implemented)

- [x] Query keys: `buildMaterialPackageSquareQueryKey(useBackend)`
  - `app/components/chat/materialPackage/materialPackageQueries.ts`
  - `app/components/chat/materialPackage/materialPackageQueries.test.ts`
- [x] Square cache helpers + tests
  - `app/components/chat/materialPackage/materialPackageSquareCache.ts`
  - `app/components/chat/materialPackage/materialPackageSquareCache.test.ts`
- [x] Mock square list + tests（从 mock-store 读取并过滤 visibility=1）
  - `app/components/chat/materialPackage/materialPackageMock.ts`
  - `app/components/chat/materialPackage/materialPackageMock.test.ts`
- [x] Square UI（列表 + 详情 + 导入）
  - `app/components/chat/materialPackage/materialPackageSquareView.tsx`
  - `app/components/materialPackage/materialPackageApi.ts`（`getMaterialPackageSquare` typing）
- [x] `/chat/material-package` 主区固定为素材包广场（移除“我的管理”页）
  - `app/components/chat/materialPackage/materialPackagePage.tsx`
- [x] 发现-广场顶部增加「素材包广场」入口图标
  - `app/components/chat/discover/discoverArchivedSpacesView.tsx`
- [x] NavPanel mutations 同步到 square cache（内容/重命名/可见性/新建/删除）
  - `app/components/chat/materialPackage/materialPackageNavPanel.tsx`

## Verification (passed)

- `pnpm -s typecheck`
- `pnpm -s vitest run app/components/chat/materialPackage/materialPackageDraft.test.ts app/components/chat/materialPackage/materialPackageExplorerOps.test.ts app/components/chat/materialPackage/materialPackageVisibility.test.ts app/components/chat/materialPackage/materialPackageSquareCache.test.ts app/components/chat/materialPackage/materialPackageQueries.test.ts app/components/chat/materialPackage/materialPackageMock.test.ts`
