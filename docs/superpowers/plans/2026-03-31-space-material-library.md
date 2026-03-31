# Space Material Library Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-space “局内素材库” panel in the chat left drawer to browse space material packages, queue materials (with ordering), choose a target room, and send materials (single or multi-message) to that room; also support importing a public/user package into the current space.

**Architecture:** Implement a new `SpaceMaterialLibraryPanel` rendered from `ChatRoomListPanel` via a lightweight mode switch (“频道/局内素材库”). Use React Query + existing `materialPackageApi.ts` wrappers to list/fetch `SpaceMaterialPackageRecord`. Implement a send tray with a queue that stores only `material` items; `folder/package` are expanded at enqueue time (DFS by `children` order). Sending uses `tuanchat.chatController.sendMessage1` sequentially by default for deterministic ordering; optionally optimize current-room sending via `RoomContext.sendMessageWithInsert` when available.

**Tech Stack:** React + React Router, `@tanstack/react-query`, zustand stores (role selection), existing API clients (`tuanchat`, `materialPackageApi.ts`), Tailwind/DaisyUI.

---

## Files / Modules (planned)

**Sidebar wiring**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/room/chatRoomListPanel.tsx`
- Create: `material-package-nav/tuan-chat-web-main/app/components/chat/materialLibrary/spaceMaterialLibraryPanel.tsx`

**Space-material queries**
- Create: `material-package-nav/tuan-chat-web-main/app/components/chat/materialLibrary/spaceMaterialPackageQueries.ts`
- Create: `material-package-nav/tuan-chat-web-main/app/components/chat/materialLibrary/useSpaceMaterialPackages.ts`

**Queue + send engine**
- Create: `material-package-nav/tuan-chat-web-main/app/components/chat/materialLibrary/sendTray.types.ts`
- Create: `material-package-nav/tuan-chat-web-main/app/components/chat/materialLibrary/sendTrayQueue.ts`
- Create: `material-package-nav/tuan-chat-web-main/app/components/chat/materialLibrary/useSendTray.ts`

**Tree flattening helpers**
- Create: `material-package-nav/tuan-chat-web-main/app/components/chat/materialLibrary/materialFlatten.ts`
- Test: `material-package-nav/tuan-chat-web-main/app/components/chat/materialLibrary/materialFlatten.test.ts`

**Drag & direct send (stage 1 desktop)**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/chatFrameView.tsx` (or `chatFrameList.tsx` if that’s where drop target is stable)
- Create: `material-package-nav/tuan-chat-web-main/app/components/chat/materialLibrary/materialLibraryDnd.ts`

**Import to space**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/materialLibrary/spaceMaterialLibraryPanel.tsx` (UI + modal)
- Reuse: `material-package-nav/tuan-chat-web-main/app/components/materialPackage/materialPackageApi.ts` (`importMaterialPackageToSpace`)

---

## Chunk 1: Sidebar mode switch + placeholder panel

### Task 1: Add panel mode state in `ChatRoomListPanel`

**Files:**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/room/chatRoomListPanel.tsx`

- [ ] Add a local state `panelMode: "rooms" | "spaceMaterials"` persisted per `spaceId` (localStorage key like `tc:space-material-library:panelMode:${spaceId}`).
- [ ] Add a compact 2-button toggle under `SpaceHeaderBar`:
  - “频道” (rooms mode)
  - “局内素材库” (spaceMaterials mode)
- [ ] When in `spaceMaterials` mode, render `<SpaceMaterialLibraryPanel ... />`; otherwise keep existing sidebar tree unchanged.

### Task 2: Add `SpaceMaterialLibraryPanel` skeleton

**Files:**
- Create: `material-package-nav/tuan-chat-web-main/app/components/chat/materialLibrary/spaceMaterialLibraryPanel.tsx`

- [ ] Render a basic layout:
  - Top: title row + “导入素材包” button (stub)
  - Middle: placeholder list (“加载局内素材包中…”)
  - Bottom: send tray placeholder (target room dropdown + disabled send)

**Manual check:**
- [ ] Run app and ensure toggling doesn’t break existing room sidebar.

---

## Chunk 2: Space material packages queries + basic explorer

### Task 3: Add React Query keys + hooks

**Files:**
- Create: `material-package-nav/tuan-chat-web-main/app/components/chat/materialLibrary/spaceMaterialPackageQueries.ts`
- Create: `material-package-nav/tuan-chat-web-main/app/components/chat/materialLibrary/useSpaceMaterialPackages.ts`

- [ ] Implement query keys:
  - `["spaceMaterialPackage", "list", spaceId]`
  - `["spaceMaterialPackage", "detail", spacePackageId]`
- [ ] Implement hooks calling `listSpaceMaterialPackages(spaceId)` / `getSpaceMaterialPackage(spacePackageId)`.
- [ ] Add `staleTime` (e.g. 30–60s) and `retry: 0` for clearer UX.

### Task 4: Minimal explorer UI (stage 1)

**Files:**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/materialLibrary/spaceMaterialLibraryPanel.tsx`
- Create: `material-package-nav/tuan-chat-web-main/app/components/chat/materialLibrary/materialFlatten.ts`

- [ ] Show packages as a collapsible list:
  - package name rows (expand/collapse)
  - inside: folders/materials rendered as indented rows
- [ ] Clicking a `material` row enqueues it (or opens a small preview stub for now) — pick one:
  - Stage 1: click = enqueue (faster)
  - Stage 1.1: click = preview, double click = enqueue
- [ ] Implement `flattenFolderToMaterials(content, folderPath)` that returns ordered material refs (DFS) for enqueue/sending.

### Task 5: Unit tests for flatten ordering

**Files:**
- Create: `material-package-nav/tuan-chat-web-main/app/components/chat/materialLibrary/materialFlatten.test.ts`

- [ ] Write tests:
  - DFS order matches `children` order
  - Nested folders are expanded correctly
  - Non-material nodes are skipped

Run:
- [ ] `cd material-package-nav/tuan-chat-web-main`
- [ ] `pnpm -s vitest run app/components/chat/materialLibrary/materialFlatten.test.ts`

---

## Chunk 3: Send tray (queue, ordering, target room)

### Task 6: Queue model (material-only)

**Files:**
- Create: `material-package-nav/tuan-chat-web-main/app/components/chat/materialLibrary/sendTray.types.ts`
- Create: `material-package-nav/tuan-chat-web-main/app/components/chat/materialLibrary/sendTrayQueue.ts`

- [ ] Define types:
  - `QueueItem { id; title; source: { spacePackageId; path; materialName }; messages: MaterialMessageItem[] }`
  - `QueueItemStatus` + per-message internal status (for i/j)
- [ ] Implement pure queue ops:
  - `enqueueMaterials(existing, materials)`
  - `moveItem(existing, from, to)`
  - `removeItem(existing, id)`
  - `clear(existing)`

### Task 7: Target room dropdown (default current)

**Files:**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/materialLibrary/spaceMaterialLibraryPanel.tsx`
- Create: `material-package-nav/tuan-chat-web-main/app/components/chat/materialLibrary/useSendTray.ts`

- [ ] Build `useSendTray({ spaceId, roomsInSpace, activeRoomId })`:
  - chooses default target room = activeRoomId
  - persists selected target room per spaceId
- [ ] Disable send button until target room chosen and queue non-empty.

### Task 8: Ordering controls (non-drag A11y path)

**Files:**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/materialLibrary/spaceMaterialLibraryPanel.tsx`

- [ ] Render queue list with:
  - 1/2/3 numbering
  - “上移/下移” buttons
  - remove button

---

## Chunk 4: Sending engine (sequential, stop, retry)

### Task 9: Convert material messages → ChatMessageRequest[]

**Files:**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/materialLibrary/useSendTray.ts`

- [ ] Map each `MaterialMessageItem` to `ChatMessageRequest`:
  - `roomId` = target room
  - `roleId/avatarId` = item overrides if present else fallback from `useRoomRoleSelectionStore` (roomId->roleId, roleId->avatarId) else 0
  - `content/messageType/extra/webgal/annotations` from item

### Task 10: Sequential send with progress + stop

**Files:**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/materialLibrary/useSendTray.ts`

- [ ] Implement `sendQueue()`:
  - loops queue items in order
  - loops messages within item in order
  - uses `tuanchat.chatController.sendMessage1(request)` sequentially (deterministic)
  - updates per-message and per-item statuses
- [ ] Implement “停止发送”:
  - sets a `stopRequested` ref; stop after current message finishes
- [ ] Implement retry options:
  - continue from first failed i/j
  - retry failed item (from message 1)
  - retry all failed

### Task 11: Manual UX verification

- [ ] Enqueue a multi-message material and ensure it sends in order.
- [ ] Trigger a failure (e.g. invalid roomId in dev) and verify:
  - stops
  - status shows failed i/j
  - retry continues correctly

---

## Chunk 5: Import from square/my into space (落库)

### Task 12: Import modal (minimal)

**Files:**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/materialLibrary/spaceMaterialLibraryPanel.tsx`

- [ ] Implement a simple modal:
  - choose source: “素材广场” / “我的素材包”
  - list packages via existing APIs (reuse the global queries or call `getMaterialPackageSquare` / `getMyMaterialPackages`)
  - on confirm: call `importMaterialPackageToSpace(packageId, { spaceId })`
  - refetch space list query, auto-expand the newly imported package

---

## Chunk 6: Direct send by dropping onto current chat (desktop)

### Task 13: DnD payload for space materials

**Files:**
- Create: `material-package-nav/tuan-chat-web-main/app/components/chat/materialLibrary/materialLibraryDnd.ts`

- [ ] Define `SpaceMaterialDragPayload { kind: "folder" | "material"; spacePackageId; path; label }`.
- [ ] Set drag data from explorer rows.

### Task 14: Drop handler in chat frame (current room)

**Files:**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/chatFrameView.tsx` (or `chatFrameList.tsx`)

- [ ] On `dragover`: if drag payload is materialLibrary type, `preventDefault` and show a subtle drop highlight.
- [ ] On `drop`:
  - resolve payload → fetch `SpaceMaterialPackageRecord` detail (from query cache or request)
  - expand to materials (DFS) → build requests using **current roomId** (direct-send path)
  - send sequentially via `tuanchat.chatController.sendMessage1`

**Mobile parity:**
- [ ] Ensure mobile has non-drag alternative via “发送到当前房间” button in explorer row menu (stage 1).

---

## Verification (end)

- [ ] Typecheck: `cd material-package-nav/tuan-chat-web-main; pnpm -s typecheck`
- [ ] Targeted tests: `pnpm -s vitest run app/components/chat/materialLibrary/materialFlatten.test.ts`
- [ ] Manual: toggle sidebar mode, import, enqueue, reorder, send, stop/retry, direct drop to chat (desktop)

