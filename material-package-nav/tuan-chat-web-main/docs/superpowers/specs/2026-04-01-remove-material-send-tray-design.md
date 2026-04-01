## 背景

局内素材库当前存在“素材队列”（右侧抽屉/把手），支持拖入队列后再点“发送”，并可选择目标房间。用户希望移除该功能：只保留拖拽直接发送（单素材/文件夹/多选）即可。

同时需要保留一个“防误操作”机制：当一次拖拽会发送很多条消息时，需要在移动端/PC 端都可用的确认弹窗，而不是 `window.confirm`。

## 目标

- 移除素材队列 UI（抽屉、把手、清空/发送/目标房间选择等）。
- 移除“加入队列再发送”的交互路径：拖拽到聊天区/房间列表即触发发送。
- 当预计发送消息数超过阈值（沿用现有逻辑：`> 10`）时，弹出跨端确认弹窗：确认才发送，取消不发送。

## 非目标

- 不实现“发送前预览/可编辑发送队列顺序”等功能（已明确不需要）。
- 不调整素材内容解析与消息生成规则（沿用现有 `resolveMaterialMessagesFromPayload` 等工具函数）。

## 交互与文案

- 拖拽单素材/文件夹/多选到聊天区或房间：
  - 若解析得到 `messagesTotal <= 10`：直接发送。
  - 若 `messagesTotal > 10`：弹出确认弹窗。
- 确认弹窗（`<dialog class="modal modal-open">` + `createPortal(document.body)`）：
  - 标题：`确认发送`
  - 正文：`将发送 {count} 条消息。该操作不可撤销。`
  - 按钮：`取消` / `发送`

## 实现点

- 删除并清理：
  - `MaterialSendTray` 组件与其渲染入口
  - `materialSendTrayStore` 与相关测试
  - `tc:material-send-tray:set-target-room` 事件与所有调用点
- 新增一个轻量 confirm store + 组件（不存队列、不存排序）：
  - store 仅保存待确认的一次性发送请求（`roomId`、`count`、已构造好的 `ChatMessageRequest[]`）
  - `MaterialSendConfirmDialog` 常驻挂载（例如在 `ChatRoomListPanel` 末尾），负责渲染弹窗与触发最终发送

## 验收

- 不再出现素材队列 UI。
- 任意拖拽发送行为不再“加入队列”，而是直发。
- 大批量发送会出现跨端确认弹窗；确认后发送成功；取消则不发送。
