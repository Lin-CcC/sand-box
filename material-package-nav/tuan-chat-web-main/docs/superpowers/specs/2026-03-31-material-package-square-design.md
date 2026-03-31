# 素材包广场（Square）集成到「我的素材包」页 — 设计稿

日期：2026-03-31  
参考 PRD：`J:\code\tuan-chat\material_package_PRD.md`

## 背景

- 现有「发现」页展示的是模组/仓库广场，而不是素材包广场，用户容易误解。
- PRD 建议把“素材广场 + 个人素材包”放在一起，并且局外素材包默认公开，可进入素材广场。

## 目标

1. 在 `/chat/material-package`（我的素材包）右侧主区提供「素材包广场」入口，并默认打开。
2. 素材包广场展示公开的局外素材包列表（`GET /materialPackage/square`），可查看详情并导入到当前 space。
3. 左侧目录树与工具栏保持可用，不打断管理/拖拽/预览使用。
4. 可见性联动：公开(1)出现在广场；私有(0)不出现在广场；创建默认公开。

## 方案（B1）

- `/chat/material-package` 右侧主区固定展示 **素材包广场**（不再提供“我的管理”页）。
- 「发现-广场」页顶部增加一个 **素材包广场** 图标入口，点击跳转到 `/chat/material-package`。

### 素材包广场（Square）

- 列表字段（按 PRD）：包名、简介、封面、更新时间、导入次数（作者信息若接口未提供可先用 `userId` 占位）。
- 点击卡片：打开详情面板（桌面端右侧面板，移动端全屏覆盖）。
- 详情动作：`导入到当前空间`（若无 activeSpaceId，则提示先选择空间）。

（注：已移除“我的管理”页，避免入口复杂化。）

## 数据流与缓存策略

- React Query:
  - 我的素材包：`buildMaterialPackageMyQueryKey(useBackend)`
  - 素材包广场：`buildMaterialPackageSquareQueryKey(useBackend)`
  - 详情：`buildMaterialPackageDetailQueryKey(packageId,useBackend)`
- 为避免频繁 refetch：在左侧对素材包的更新（内容/重命名/可见性/新建/删除）时，前端就地更新广场列表缓存：
  - `visibility=1` => upsert 到广场列表
  - `visibility=0` => 从广场列表移除
