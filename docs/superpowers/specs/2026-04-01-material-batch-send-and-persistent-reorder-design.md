# 局内素材库批量发送 + 目录重排持久化（设计稿）

日期：2026-04-01  
实现仓库：`J:\code\tuan-chat-sandbox\material-package-nav\tuan-chat-web-main`  
涉及范围：`局内素材库（space）` + `我的素材包（global）`

## 1. 背景与目标

PRD 核心要求（`J:\code\tuan-chat\material_package_PRD.md`）：
- 素材是“消息”的统一抽象：一个素材（material）包含 1..N 条消息（messages）。
- 房间内消费素材：将素材拖入房间发送；若素材含多条消息，需按顺序批量发送。
- 局内素材包与局外素材包数据结构一致，区别仅作用域；两侧都可编辑并调整文件夹结构。

本设计在已有实现基础上补齐两类能力：
1) **批量发送（space）**：支持拖动文件夹递归发送、支持多选按顺序发送，并提供必要的“发送队列（仅多选场景）”。
2) **目录重排（space + global）**：同一文件夹内拖拽重排 folder/material，且**持久化保存**到素材包 content（刷新/重进仍保持）。

## 2. 术语与数据结构

- `MaterialPackageContent`：`root: (folder/material)[]` 的树结构。
- `folder`：仅是包内组织节点，可包含子 folder 与 material。
- `material`：包含 `messages: MaterialMessageItem[]`。
- “列表顺序”：指 UI 当前渲染出来的 siblings 顺序（即 content 中数组顺序），不是按名称排序。

## 3. 批量发送（落在：局内素材库）

### 3.1 行为总览

发送入口在“拖拽到房间/点击发送”这类房间消费入口上，语义按下述规则统一：

1) **拖动单个 material**：直接发送该 material 的 messages（按 messages 顺序逐条发）。
2) **拖动单个 folder**：递归展开该 folder 下所有 material，按“目录树顺序”依次发送：
   - 展开顺序：深度优先（DFS），每层按当前 siblings 顺序遍历。
   - 每个 material 内部 messages 仍按 messages 顺序逐条发。
3) **多选拖动（仅 material）**：不直接发送，弹出“发送队列”：
   - 队列按“列表顺序”入队（默认规则）。
   - 队列中显示 `1/2/3...` 序号（只在队列显示，不在树上显示）。
   - 队列允许二次调整顺序、删除、清空、发送。

说明：
- 发送队列/确认面板**只在多选场景显示**。
- 单文件/单文件夹默认不显示预览/队列，强调“拖进房间就执行”的 VSCode 心智。

### 3.2 防误触阈值（单文件夹也可能很大）

即使是“单文件夹拖拽”，也可能展开出大量 messages。为避免误操作刷屏，加入自动保护：

- 计算本次发送最终 messages 总条数 `messagesTotal`。
- 若 `messagesTotal <= 10`：直接发送（不弹队列）。
- 若 `messagesTotal > 10`：进入“队列/确认模式”（队列里展示序号与条数，用户可取消或调整）。

阈值口径选择：按 **最终 messages 条数** 计算，而非文件数（material 数），因为风险与耗时更取决于消息条数。

### 3.3 发送实现策略（保证严格顺序）

统一要求：**严格按队列顺序发送**，并保证 material 内部 messages 顺序不乱序。

建议策略：
- concurrency 固定为 1（串行发送）。
- 目标房间为当前 room：
  - 优先使用已有 `sendMessageWithInsert(req)` 逐条发送（可即时插入消息列表，顺序稳定）。
- 目标房间非当前 room：
  - 使用后端单条发送接口逐条发送（`/chat/message`），而非一次性 `batchSendMessages`。
  - 目的：更好地保证严格顺序，并能精确定位失败条目（第 i 条失败）。

### 3.4 失败处理（最小可用）

- 任一条发送失败：停止后续发送。
- 保留队列与当前进度，提示“第 N 条失败”。
- 支持：重试 / 从失败处继续（同一语义，继续从失败条目开始串行发送）。

## 4. 目录重排并持久化（space + global）

### 4.1 范围与规则

在同一个父文件夹（同一 siblings 列表）内支持拖拽重排：
- `folder` 与 `material` 都可以参与排序。
- 交互为“拖到另一个节点上方”，表示“插入到该节点之前”。
- 重排后需要写回 `MaterialPackageContent` 并保存到后端（或 mock），确保刷新/重进保持顺序。

### 4.2 与“移动到别的文件夹”的区分（必须明显）

必须区分两类拖拽目标与视觉反馈：

1) **重排（reorder）**
   - 目标：某个节点的“上方插入位置”。
   - 视觉：显示明显的“插入线/插入标记”（例如一条细线 + 轻高亮），提示会改变顺序。
2) **移动（move）**
   - 目标：某个 folder 节点本身（drop 到 folder 上）。
   - 视觉：folder 行整体高亮/框住，提示会变更父级目录（移动到该文件夹里）。

注：同文件夹内拖拽既可能是 reorder，也可能是 move（拖到 folder 上）。两者要以“落点”明确分流。

### 4.3 持久化写入点

- `局内素材库（space）`：保存 `SpaceMaterialPackageRecord.content`（后端 `updateSpaceMaterialPackage` / mock 写入）。
- `我的素材包（global）`：保存 `MaterialPackageRecord.content`（对应后端更新接口 / mock 写入）。

## 5. 验收标准（按本设计）

1) 局内素材库中：拖动单个 material 到房间，按 messages 顺序逐条发送。
2) 局内素材库中：拖动单个 folder（含子文件夹）到房间，按目录树顺序递归展开并逐条发送。
3) 当 `messagesTotal > 10` 时，即使是单个 folder，也会进入队列/确认模式而非直接发送。
4) 多选拖动（material）：弹出发送队列；队列内显示 `1/2/3...` 顺序编号；默认按列表顺序入队。
5) 局内素材库：同父文件夹内拖拽重排 folder/material，刷新后顺序保持。
6) 我的素材包：同父文件夹内拖拽重排 folder/material，刷新后顺序保持。
7) 拖拽视觉反馈能清晰区分：reorder（插入线）与 move（folder 行高亮）。

