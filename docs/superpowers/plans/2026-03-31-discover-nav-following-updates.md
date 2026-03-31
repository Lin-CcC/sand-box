# Discover Nav Following Updates Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update `ChatDiscoverNavPanel` to include “素材包广场 / 仓库广场” entries with a clean “following updates” expand panel, while keeping archived navigation.

**Architecture:** Keep `ChatDiscoverNavPanel` as the UI composition root. Fetch repository following updates via existing `POST /feed/moment` (React Query). Material-package updates are mocked/empty until a backend feed exists; UI and interaction are implemented now.

**Tech Stack:** React + React Router, `@tanstack/react-query`, existing `tuanchat` API client, Tailwind/DaisyUI classes.

---

## File/Module Map

- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/discover/chatDiscoverNavPanel.tsx`
  - B-layout “发现入口” card + “归档仓库” section
  - Main hotzone button + separate toggle button (accessibility)
  - Expand/collapse updates list (mutual exclusive)
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/discover/discoverPage.tsx`
  - Add `mode` prop (`"square" | "my"`) and pass to nav panel
- Modify: `material-package-nav/tuan-chat-web-main/app/routes/chatDiscover.tsx`
  - Render `<DiscoverPage mode="square" />`
- Modify: `material-package-nav/tuan-chat-web-main/app/routes/chatDiscoverMy.tsx`
  - Replace redirect with `<DiscoverPage mode="my" />`

## Task 1: Add discover mode wiring

**Files:**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/discover/discoverPage.tsx`
- Modify: `material-package-nav/tuan-chat-web-main/app/routes/chatDiscover.tsx`
- Modify: `material-package-nav/tuan-chat-web-main/app/routes/chatDiscoverMy.tsx`

- [ ] Update `DiscoverPage` to accept `mode` prop and pass through to `DiscoverArchivedSpacesView` and `ChatDiscoverNavPanel`.
- [ ] Update `chatDiscover.tsx` to render `mode="square"`.
- [ ] Update `chatDiscoverMy.tsx` to render `mode="my"` (remove redirect).

## Task 2: Implement B-layout nav panel + routing

**Files:**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/discover/chatDiscoverNavPanel.tsx`

- [ ] Add “发现入口” card with two rows: “素材包广场” -> `/chat/material-package`, “仓库广场” -> `/chat/discover`.
- [ ] Keep “归档仓库” section with “广场” (`/chat/discover`) and “我的归档” (`/chat/discover/my`) and highlight via `activeMode`.
- [ ] Implement hotzones:
  - main button: navigate to route + close drawer
  - toggle button: expand/collapse updates list + `aria-*`

## Task 3: Add repository following updates (stage 1)

**Files:**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/discover/chatDiscoverNavPanel.tsx`

- [ ] Use `useQuery` to call `tuanchat.feedController.getFollowingMomentFeed({ pageSize: 20 })` (enabled when logged-in).
- [ ] Filter to repository-related items (default set `{5,6,7,8}`) and those with numeric `response.repositoryId`.
- [ ] Map to display items (max 5):
  - actor: `response.userId` (optional)
  - title: `response.name` or `仓库 #id`
  - timestamp: `response.createTime` or `response.updateTime`
  - click -> `navigate('/chat/discover?repositoryId=...')`
- [ ] Collapse-state: show only a small dot + count inside toggle button (optional); keep UI minimal.

## Task 4: Material-package following updates placeholder (stage 1)

**Files:**
- Modify: `material-package-nav/tuan-chat-web-main/app/components/chat/discover/chatDiscoverNavPanel.tsx`

- [ ] Implement the same expand/collapse container for “素材包广场”.
- [ ] Stage 1 behavior:
  - no backend feed yet -> show empty state (“暂无更新/待后端接口”)
  - click main row -> `/chat/material-package`

## Task 5: Verification

- [ ] Run typecheck from sandbox project root:
  - `cd J:\code\tuan-chat-sandbox\material-package-nav\tuan-chat-web-main`
  - `pnpm -s typecheck`
- [ ] Smoke check in dev/test:
  - Open `/chat/discover` and `/chat/discover/my`
  - Ensure nav panel renders, hotzones work, and expanding does not navigate

