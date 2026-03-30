import type {
  MaterialNode,
  MaterialPackageRecord,
} from "@/components/materialPackage/materialPackageApi";
import type { MaterialPreviewPayload } from "@/components/chat/materialPackage/materialPackageDnd";

import { FileImageIcon, PackageIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getMyMaterialPackages } from "@/components/materialPackage/materialPackageApi";
import { readMockPackages } from "@/components/chat/materialPackage/materialPackageMockStore";
import MaterialPreviewFloat from "@/components/chat/materialPackage/materialPreviewFloat";
import PortalTooltip from "@/components/common/portalTooltip";
import { ChevronDown, FolderIcon, SidebarSimpleIcon } from "@/icons";
import { useLocalStorage } from "@/components/common/customHooks/useLocalStorage";
import { buildMaterialPackageMyQueryKey } from "@/components/chat/materialPackage/materialPackageQueries";
import {
  isMaterialPreviewDrag,
  getMaterialPreviewDragData,
  setMaterialPreviewDragData,
  getMaterialPreviewDragOrigin,
  setMaterialPreviewDragOrigin,
} from "@/components/chat/materialPackage/materialPackageDnd";

interface MaterialPackageNavPanelProps {
  onCloseLeftDrawer: () => void;
  onToggleLeftDrawer?: () => void;
  isLeftDrawerOpen?: boolean;
  dockedPreview: MaterialPreviewPayload | null;
  dockedIndex?: number;
  onDockPreview: (payload: MaterialPreviewPayload, options?: { index?: number; placement?: "top" | "bottom" }) => void;
  onMoveDockedPreview: (nextIndex: number) => void;
  onUndockPreview: () => void;
  onOpenPreview: (payload: MaterialPreviewPayload, hintPosition?: { x: number; y: number } | null) => void;
}

type ExplorerNodeKey = string;

function buildNodeKey(args: {
  packageId: number;
  path: string[];
}) {
  const safePath = args.path.map(part => part.replaceAll("/", "／"));
  return `pkg:${args.packageId}:${safePath.join("/")}`;
}

function toPreviewPayload(args: {
  kind: MaterialPreviewPayload["kind"];
  packageId: number;
  label: string;
  path: string[];
}): MaterialPreviewPayload {
  return {
    kind: args.kind,
    packageId: args.packageId,
    label: args.label,
    path: args.path,
  };
}

function flattenPath(path: string[]) {
  return path.join("/");
}

function normalizePackages(payload: unknown): MaterialPackageRecord[] {
  if (!Array.isArray(payload))
    return [];
  return payload.filter(Boolean) as MaterialPackageRecord[];
}

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function MaterialPackageNavPanel({
  onCloseLeftDrawer,
  onToggleLeftDrawer,
  isLeftDrawerOpen,
  dockedPreview,
  dockedIndex = 0,
  onDockPreview,
  onMoveDockedPreview,
  onUndockPreview,
  onOpenPreview,
}: MaterialPackageNavPanelProps) {
  const leftDrawerLabel = isLeftDrawerOpen ? "收起侧边栏" : "展开侧边栏";
  const defaultUseBackend = !(import.meta.env.MODE === "test");
  const [useBackend, setUseBackend] = useLocalStorage<boolean>("tc:material-package:use-backend", defaultUseBackend);

  const packagesQuery = useQuery({
    queryKey: buildMaterialPackageMyQueryKey(useBackend),
    queryFn: () => useBackend ? getMyMaterialPackages() : Promise.resolve(readMockPackages()),
    staleTime: 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const packages = useMemo(() => {
    return normalizePackages(packagesQuery.data);
  }, [packagesQuery.data]);

  const [collapsedByKey, setCollapsedByKey] = useState<Record<ExplorerNodeKey, boolean>>({});
  const toggleCollapsed = useCallback((key: ExplorerNodeKey) => {
    setCollapsedByKey(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const lastClickRef = useRef<{ key: string; timeMs: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const treeItemsRef = useRef<HTMLDivElement | null>(null);
  const [dockHint, setDockHint] = useState<{ index: number; text: string } | null>(null);
  const [dockLineTop, setDockLineTop] = useState<number | null>(null);
  const [dockTipTop, setDockTipTop] = useState<number | null>(null);

  const clearDockHint = useCallback(() => {
    setDockHint(null);
    setDockLineTop(null);
    setDockTipTop(null);
  }, []);

  const computeDockLineTop = useCallback((index: number) => {
    const scrollEl = scrollRef.current;
    if (!scrollEl)
      return null;
    const scrollRect = scrollEl.getBoundingClientRect();
    const itemsRoot = treeItemsRef.current;
    const items = itemsRoot ? Array.from(itemsRoot.querySelectorAll<HTMLElement>("[data-role='material-package-visible-row'][data-base-index]")) : [];
    if (!items.length) {
      return index <= 0 ? 88 : Math.max(120, scrollEl.scrollHeight - 24);
    }
    const last = items[items.length - 1]!;
    const exact = items.find(el => Number(el.dataset.baseIndex) === index) ?? null;
    const rect = (exact ?? last).getBoundingClientRect();
    const y = exact ? rect.top : rect.bottom + 1;
    const localY = y - scrollRect.top + scrollEl.scrollTop;
    return Math.max(16, localY - 1);
  }, []);

  const applyDockHint = useCallback((hint: { index: number; text: string } | null) => {
    if (!hint) {
      clearDockHint();
      return;
    }
    setDockHint(prev => (prev?.index === hint.index && prev?.text === hint.text ? prev : hint));
    const top = computeDockLineTop(hint.index);
    if (top == null) {
      setDockLineTop(null);
      setDockTipTop(null);
      return;
    }
    setDockLineTop(top);
    setDockTipTop(Math.max(6, top - 18));
  }, [clearDockHint, computeDockLineTop]);

  const openPreview = useCallback((payload: MaterialPreviewPayload, hintPosition?: { x: number; y: number } | null) => {
    onOpenPreview(payload, hintPosition ?? null);
  }, [onOpenPreview]);

  const maybeOpenPreviewByDoubleClick = useCallback((event: React.MouseEvent, key: string, payload: MaterialPreviewPayload) => {
    // NOTE: 线上反馈里 dblclick / event.detail 在部分环境不稳定，这里手动做“双击检测”兜底
    const nowMs = Date.now();
    const prev = lastClickRef.current;
    lastClickRef.current = { key, timeMs: nowMs };
    const isSameTarget = prev?.key === key;
    const isWithinWindow = typeof prev?.timeMs === "number" && (nowMs - prev.timeMs) <= 350;
    if (!isSameTarget || !isWithinWindow)
      return;

    lastClickRef.current = null;
    event.preventDefault();
    event.stopPropagation();
    openPreview(payload, null);
  }, [openPreview]);

  type VisibleItem =
    | {
      kind: "package";
      key: string;
      depth: number;
      baseIndex: number;
      isCollapsed: boolean;
      nodeCount: number;
      label: string;
      payload: MaterialPreviewPayload;
    }
    | {
      kind: "folder";
      key: string;
      depth: number;
      baseIndex: number;
      isCollapsed: boolean;
      name: string;
      payload: MaterialPreviewPayload;
    }
    | {
      kind: "material";
      key: string;
      depth: number;
      baseIndex: number;
      name: string;
      payload: MaterialPreviewPayload;
    }
    | {
      kind: "dockPreview";
      key: "dock-preview";
      depth: number;
      payload: MaterialPreviewPayload;
    };

  const baseVisibleItems = useMemo(() => {
    const items: VisibleItem[] = [];

    const pushNode = (packageId: number, node: MaterialNode, path: string[], depth: number) => {
      const indent = depth * 14;
      if (node.type === "folder") {
        const key = buildNodeKey({ packageId, path });
        const isCollapsed = Boolean(collapsedByKey[key]);
        const payload = toPreviewPayload({
          kind: "folder",
          packageId,
          label: node.name,
          path,
        });
        items.push({
          kind: "folder",
          key,
          depth: indent,
          baseIndex: items.length,
          isCollapsed,
          name: node.name,
          payload,
        });
        if (!isCollapsed) {
          for (const child of node.children) {
            const childPath = [...path, child.type === "folder" ? `folder:${child.name}` : `material:${child.name}`];
            pushNode(packageId, child, childPath, depth + 1);
          }
        }
        return;
      }

      const key = buildNodeKey({ packageId, path });
      const payload = toPreviewPayload({
        kind: "material",
        packageId,
        label: node.name,
        path,
      });
      items.push({
        kind: "material",
        key,
        depth: indent,
        baseIndex: items.length,
        name: node.name,
        payload,
      });
    };

    for (const pkg of packages) {
      const packageId = Number(pkg.packageId ?? 0);
      const rootKey = `root:${packageId}`;
      const isCollapsed = Boolean(collapsedByKey[rootKey]);
      const label = pkg.name ?? `素材包#${packageId}`;
      const packagePayload = toPreviewPayload({
        kind: "package",
        packageId,
        label,
        path: [],
      });
      const rootNodes = Array.isArray(pkg.content?.root) ? pkg.content.root : [];

      items.push({
        kind: "package",
        key: rootKey,
        depth: 0,
        baseIndex: items.length,
        isCollapsed,
        nodeCount: rootNodes.length,
        label,
        payload: packagePayload,
      });

      if (isCollapsed) {
        continue;
      }

      for (const node of rootNodes) {
        const name = node?.type === "folder" ? node.name : node?.type === "material" ? node.name : "未知节点";
        const nextPath = [node.type === "folder" ? `folder:${name}` : `material:${name}`];
        pushNode(packageId, node, nextPath, 1);
      }
    }

    return items;
  }, [collapsedByKey, packages]);

  const baseItemCount = baseVisibleItems.length;
  const resolvedDockIndex = useMemo(() => clampInt(dockedIndex, 0, baseItemCount), [baseItemCount, dockedIndex]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as any;
      if (!detail || detail.visible === false) {
        clearDockHint();
        return;
      }
      if (typeof detail.index === "number" && Number.isFinite(detail.index)) {
        const index = clampInt(Math.floor(detail.index), 0, baseItemCount);
        const text = typeof detail.text === "string" ? detail.text : "插入到这里";
        applyDockHint({ index, text });
        return;
      }

      const kind: "top" | "bottom" = detail.kind === "top" ? "top" : "bottom";
      const index = kind === "top" ? 0 : baseItemCount;
      const text = typeof detail.text === "string" ? detail.text : (kind === "top" ? "插入到顶部" : "插入到底部");
      applyDockHint({ index, text });
    };
    window.addEventListener("tc:material-package:dock-hint", handler as EventListener);
    return () => window.removeEventListener("tc:material-package:dock-hint", handler as EventListener);
  }, [applyDockHint, baseItemCount, clearDockHint]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as any;
      const index = typeof detail?.index === "number" && Number.isFinite(detail.index)
        ? clampInt(Math.floor(detail.index), 0, baseItemCount)
        : null;
      if (index == null) {
        return;
      }
      onMoveDockedPreview(index);
    };
    window.addEventListener("tc:material-package:dock-move", handler as EventListener);
    return () => window.removeEventListener("tc:material-package:dock-move", handler as EventListener);
  }, [baseItemCount, onMoveDockedPreview]);

  const visibleItems = useMemo(() => {
    if (!dockedPreview) {
      return baseVisibleItems;
    }
    const next = [...baseVisibleItems];
    next.splice(resolvedDockIndex, 0, {
      kind: "dockPreview",
      key: "dock-preview",
      depth: 0,
      payload: dockedPreview,
    });
    return next;
  }, [baseVisibleItems, dockedPreview, resolvedDockIndex]);

  const computeInsertIndex = useCallback((clientY: number) => {
    const root = treeItemsRef.current;
    if (!root) {
      return baseItemCount;
    }
    const rows = Array.from(root.querySelectorAll<HTMLElement>("[data-role='material-package-visible-row'][data-base-index]"));
    if (!rows.length) {
      return 0;
    }
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (clientY < mid) {
        const idx = Number(row.dataset.baseIndex ?? 0);
        return Number.isFinite(idx) ? clampInt(Math.floor(idx), 0, baseItemCount) : 0;
      }
    }
    return baseItemCount;
  }, [baseItemCount]);

  const renderVisibleItem = useCallback((item: VisibleItem, _renderIndex: number) => {
    if (item.kind === "dockPreview") {
      return (
        <div
          key={item.key}
          className="px-1 rounded-md"
          data-role="material-package-visible-row"
          data-dock-preview="1"
        >
          <div className="rounded-lg border border-base-300 bg-base-200/40 overflow-hidden">
            <div className="h-[360px]">
              <MaterialPreviewFloat
                variant="embedded"
                payload={item.payload}
                onClose={onUndockPreview}
                onDock={onDockPreview}
                dragOrigin="docked"
                onPopout={(payload) => {
                  onUndockPreview();
                  onOpenPreview(payload, null);
                }}
                initialPosition={null}
              />
            </div>
          </div>
        </div>
      );
    }

    if (item.kind === "package") {
      return (
        <div
          key={item.key}
          className="px-1 rounded-md"
          data-role="material-package-visible-row"
          data-base-index={item.baseIndex}
        >
          <div
            className="flex items-center gap-1 py-1 pr-1 text-xs font-medium opacity-90 select-none rounded-md hover:bg-base-300/40"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "copy";
              setMaterialPreviewDragData(e.dataTransfer, item.payload);
              setMaterialPreviewDragOrigin(e.dataTransfer, "tree");
            }}
            onClick={(e) => {
              maybeOpenPreviewByDoubleClick(e, item.key, item.payload);
            }}
            onDoubleClick={() => openPreview(item.payload, null)}
          >
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleCollapsed(item.key);
              }}
              title={item.isCollapsed ? "展开" : "折叠"}
            >
              <ChevronDown className={`size-4 opacity-80 ${item.isCollapsed ? "-rotate-90" : ""}`} />
            </button>
            <PackageIcon className="size-4 opacity-70" weight="bold" />
            <span className="flex-1 truncate">{item.label}</span>
            <PortalTooltip label={`拖拽到右侧打开预览：${item.label}`} placement="right">
              <span className="text-[11px] opacity-50 px-1">
                {item.nodeCount ? `${item.nodeCount}项` : "空"}
              </span>
            </PortalTooltip>
          </div>
        </div>
      );
    }

    if (item.kind === "folder") {
      return (
        <div
          key={item.key}
          className="px-1 rounded-md"
          data-role="material-package-visible-row"
          data-base-index={item.baseIndex}
        >
          <div
            className="flex items-center gap-1 py-1 pr-1 text-xs font-medium opacity-85 select-none rounded-md hover:bg-base-300/40"
            style={{ paddingLeft: `${item.depth + 2}px` }}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "copy";
              setMaterialPreviewDragData(e.dataTransfer, item.payload);
              setMaterialPreviewDragOrigin(e.dataTransfer, "tree");
            }}
            onClick={(e) => {
              maybeOpenPreviewByDoubleClick(e, item.key, item.payload);
            }}
            onDoubleClick={() => openPreview(item.payload, null)}
          >
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleCollapsed(item.key);
              }}
              title={item.isCollapsed ? "展开" : "折叠"}
            >
              <ChevronDown className={`size-4 opacity-80 ${item.isCollapsed ? "-rotate-90" : ""}`} />
            </button>
            <FolderIcon className="size-4 opacity-70" />
            <span className="flex-1 truncate">{item.name}</span>
          </div>
        </div>
      );
    }

    return (
      <div
        key={item.key}
        className="flex items-center gap-2 py-1 pr-2 text-xs opacity-85 select-none rounded-md hover:bg-base-300/40"
        style={{ paddingLeft: `${item.depth + 18}px` }}
        data-role="material-package-visible-row"
        data-base-index={item.baseIndex}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "copy";
          setMaterialPreviewDragData(e.dataTransfer, item.payload);
          setMaterialPreviewDragOrigin(e.dataTransfer, "tree");
        }}
        onClick={(e) => {
          maybeOpenPreviewByDoubleClick(e, item.key, item.payload);
        }}
        onDoubleClick={() => openPreview(item.payload, null)}
      >
        <FileImageIcon className="size-4 opacity-70" />
        <span className="flex-1 truncate">{item.name}</span>
      </div>
    );
  }, [dockedPreview, maybeOpenPreviewByDoubleClick, onDockPreview, onOpenPreview, onUndockPreview, openPreview, resolvedDockIndex, toggleCollapsed]);

  return (
    <div
      className="flex flex-col w-full h-full flex-1 min-h-0 min-w-0 rounded-tl-xl border-l border-t border-gray-300 dark:border-gray-700 bg-base-200 text-base-content"
      data-role="material-package-dock-zone"
      onDragOverCapture={(e) => {
        e.preventDefault();
        if (!isMaterialPreviewDrag(e.dataTransfer))
          return;
        const origin = getMaterialPreviewDragOrigin(e.dataTransfer) ?? "tree";
        e.dataTransfer.dropEffect = origin === "docked" ? "move" : "copy";
        const index = computeInsertIndex(e.clientY);
        const baseText = index <= 0 ? "插入到顶部" : index >= baseItemCount ? "插入到底部" : "插入到这里";
        applyDockHint({ index, text: `${baseText}（${index}/${baseItemCount}）` });
      }}
      onDragLeaveCapture={() => {
        clearDockHint();
      }}
      onDropCapture={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const payload = getMaterialPreviewDragData(e.dataTransfer);
        if (!payload)
          return;
        const origin = getMaterialPreviewDragOrigin(e.dataTransfer);
        const index = dockHint?.index ?? baseItemCount;
        clearDockHint();
        if (origin === "docked") {
          onMoveDockedPreview(index);
          return;
        }
        onDockPreview(payload, { index });
      }}
    >
      <div className="flex items-center justify-between h-12 gap-2 min-w-0 border-b border-gray-300 dark:border-gray-700 rounded-tl-xl px-3">
        <div className="flex items-center gap-2 min-w-0 font-semibold truncate">
          <ChevronDown className="size-4 opacity-70" />
          我的素材包
        </div>
        {onToggleLeftDrawer && (
          <div className="tooltip tooltip-bottom" data-tip={leftDrawerLabel}>
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-square hover:text-info"
              onClick={onToggleLeftDrawer}
              aria-label={leftDrawerLabel}
              aria-pressed={Boolean(isLeftDrawerOpen)}
            >
              <SidebarSimpleIcon />
            </button>
          </div>
        )}
      </div>

      <div
        ref={scrollRef}
        className="relative flex-1 min-h-0 overflow-auto"
        onScroll={() => {
          if (!dockHint)
            return;
          applyDockHint(dockHint);
        }}
      >
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] opacity-60">
              {useBackend ? "数据源：后端" : "数据源：本地 mock（用于验收 UI）"}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => setUseBackend(!useBackend)}
              aria-pressed={useBackend}
              title={useBackend ? "切换到 mock（不请求后端）" : "切换到后端（会发起请求）"}
            >
              {useBackend ? "改用 mock" : "改用后端"}
            </button>
          </div>

          <div className="space-y-2">
            <div className="px-1 text-[11px] font-semibold tracking-wider text-base-content/50">
              TUAN-CHAT
            </div>

            <div ref={treeItemsRef} data-role="material-package-tree-items">
            {packagesQuery.isLoading && (
              <div className="px-2 py-2 text-xs opacity-70 flex items-center gap-2">
                <span className="loading loading-spinner loading-xs"></span>
                正在加载我的素材包…
              </div>
            )}

            {packagesQuery.isError && (
              <div className="px-2 py-2 text-xs text-error">
                加载失败：{packagesQuery.error instanceof Error ? packagesQuery.error.message : "未知错误"}
              </div>
            )}

            {!packagesQuery.isLoading && !packagesQuery.isError && packages.length === 0 && (
              <div className="px-2 py-2 text-xs opacity-60">
                暂无素材包
              </div>
            )}

            {!packagesQuery.isLoading && !packagesQuery.isError && visibleItems.map((item, index) => renderVisibleItem(item, index))}
            </div>
          </div>
        </div>

        {dockHint && dockLineTop != null && (
          <div
            className="pointer-events-none absolute left-3 right-3 h-0.5 rounded bg-info"
            style={{ top: dockLineTop }}
          />
        )}
        {dockHint && dockTipTop != null && (
          <div
            className="pointer-events-none absolute left-3 rounded-md border border-base-300 bg-base-100/80 px-2 py-0.5 text-[11px] text-base-content/80 backdrop-blur"
            style={{ top: dockTipTop }}
          >
            {dockHint.text}
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t border-base-300 text-[11px] opacity-60">
        提示：双击打开预览；也可以拖拽到右侧主区域。
      </div>
    </div>
  );
}
