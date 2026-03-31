import type {
  MaterialNode,
  MaterialPackageRecord,
  MaterialPackageContent,
  MaterialItemNode,
} from "@/components/materialPackage/materialPackageApi";
import type { MaterialPreviewPayload } from "@/components/chat/materialPackage/materialPackageDnd";

import { ArrowClockwise, CrosshairSimple, FileImageIcon, FilePlus, FolderPlus, PackageIcon, Plus, TrashIcon, UploadSimple } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { createMaterialPackage, deleteMaterialPackage, getMyMaterialPackages, updateMaterialPackage } from "@/components/materialPackage/materialPackageApi";
import { readMockPackages, writeMockPackages } from "@/components/chat/materialPackage/materialPackageMockStore";
import MaterialPreviewFloat from "@/components/chat/materialPackage/materialPreviewFloat";
import PortalTooltip from "@/components/common/portalTooltip";
import { ChevronDown, FolderIcon, SidebarSimpleIcon } from "@/icons";
import { useLocalStorage } from "@/components/common/customHooks/useLocalStorage";
import { buildMaterialPackageDetailQueryKey, buildMaterialPackageMyQueryKey } from "@/components/chat/materialPackage/materialPackageQueries";
import type { SelectedExplorerNode } from "@/components/chat/materialPackage/materialPackageExplorerOps";
import { autoRenameVsCodeLike, payloadPathToFolderNames, resolveTarget } from "@/components/chat/materialPackage/materialPackageExplorerOps";
import { getFolderNodesAtPath } from "@/components/chat/materialPackage/materialPackageTree";
import { buildEmptyMaterialPackageContent, draftCreateFolder, draftCreateMaterial, draftDeleteFolder, draftDeleteMaterial, draftReplaceMaterialMessages } from "@/components/chat/materialPackage/materialPackageDraft";
import { getVisibilityCopy, normalizePackageVisibility } from "@/components/chat/materialPackage/materialPackageVisibility";
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

function parseUpdateTimeMs(value: string | null | undefined) {
  const ms = Date.parse(String(value ?? ""));
  return Number.isFinite(ms) ? ms : -Infinity;
}

function buildSortedPackageIdOrder(packages: MaterialPackageRecord[]) {
  const indexed = packages.map((pkg, index) => ({ pkg, index }));
  indexed.sort((a, b) => {
    const timeDiff = parseUpdateTimeMs(b.pkg.updateTime) - parseUpdateTimeMs(a.pkg.updateTime);
    if (timeDiff !== 0)
      return timeDiff;
    const idDiff = Number(b.pkg.packageId) - Number(a.pkg.packageId);
    if (idDiff !== 0)
      return idDiff;
    return a.index - b.index;
  });
  return indexed.map(({ pkg }) => Number(pkg.packageId));
}

function reconcilePackageOrder(prevOrder: number[], nextPackages: MaterialPackageRecord[]) {
  const nextIds = nextPackages.map(p => Number(p.packageId));
  const nextIdSet = new Set(nextIds);

  const kept = prevOrder.filter(id => nextIdSet.has(id));
  const keptSet = new Set(kept);
  const added = nextPackages.filter(p => !keptSet.has(Number(p.packageId)));

  const addedIds = buildSortedPackageIdOrder(added);
  return [...addedIds, ...kept];
}

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

type ToolbarAction = "new-file" | "new-folder" | "new-package" | "import";

type PendingDeleteDialog =
  | {
    kind: "package";
    packageId: number;
    label: string;
    saving: boolean;
  }
  | {
    kind: "folder";
    packageId: number;
    folderPath: string[];
    label: string;
    saving: boolean;
  }
  | {
    kind: "material";
    packageId: number;
    folderPath: string[];
    materialName: string;
    label: string;
    saving: boolean;
  };

function extractPathName(token: string, prefix: "folder:" | "material:") {
  if (!token.startsWith(prefix))
    return null;
  const name = token.slice(prefix.length).trim();
  return name || null;
}

function payloadPathToMaterialName(path: string[] | undefined | null) {
  const parts = Array.isArray(path) ? path : [];
  for (const part of parts) {
    if (typeof part !== "string")
      continue;
    const name = extractPathName(part, "material:");
    if (name)
      return name;
  }
  return null;
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
  const [toolbarPinned, setToolbarPinned] = useLocalStorage<boolean>("tc:material-package:toolbar-pinned", false);
  const queryClient = useQueryClient();
  const listQueryKey = buildMaterialPackageMyQueryKey(useBackend);

  const packagesQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: () => useBackend ? getMyMaterialPackages() : Promise.resolve(readMockPackages()),
    staleTime: 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const rawPackages = useMemo(() => normalizePackages(packagesQuery.data), [packagesQuery.data]);
  const [packageOrder, setPackageOrder] = useState<number[] | null>(null);
  const [shouldResortPackages, setShouldResortPackages] = useState<boolean>(true);
  const prevDrawerOpenRef = useRef<boolean | undefined>(isLeftDrawerOpen);

  useEffect(() => {
    const prev = prevDrawerOpenRef.current;
    prevDrawerOpenRef.current = isLeftDrawerOpen;
    if (prev === false && isLeftDrawerOpen === true) {
      setShouldResortPackages(true);
    }
  }, [isLeftDrawerOpen]);

  useEffect(() => {
    if (!rawPackages.length) {
      setPackageOrder(null);
      setShouldResortPackages(false);
      return;
    }

    setPackageOrder((prev) => {
      if (shouldResortPackages || !prev?.length) {
        return buildSortedPackageIdOrder(rawPackages);
      }
      return reconcilePackageOrder(prev, rawPackages);
    });

    if (shouldResortPackages) {
      setShouldResortPackages(false);
    }
  }, [rawPackages, shouldResortPackages]);

  const packages = useMemo(() => {
    if (!packageOrder?.length)
      return rawPackages;

    const byId = new Map<number, MaterialPackageRecord>();
    rawPackages.forEach((pkg) => {
      byId.set(Number(pkg.packageId), pkg);
    });

    const ordered: MaterialPackageRecord[] = [];
    packageOrder.forEach((id) => {
      const pkg = byId.get(id);
      if (pkg)
        ordered.push(pkg);
    });

    if (ordered.length === rawPackages.length)
      return ordered;

    const orderedSet = new Set(ordered.map(p => Number(p.packageId)));
    rawPackages.forEach((pkg) => {
      const id = Number(pkg.packageId);
      if (!orderedSet.has(id))
        ordered.push(pkg);
    });

    return ordered;
  }, [packageOrder, rawPackages]);

  const [selectedNode, setSelectedNode] = useState<SelectedExplorerNode>(null);
  const [defaultTargetPackageId, setDefaultTargetPackageId] = useState<number | null>(null);
  const [collapsedByKey, setCollapsedByKey] = useState<Record<ExplorerNodeKey, boolean>>({});
  const toggleCollapsed = useCallback((key: ExplorerNodeKey) => {
    setCollapsedByKey(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const lastClickRef = useRef<{ key: string; timeMs: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const treeItemsRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingChoosePackage, setPendingChoosePackage] = useState<{ action: Exclude<ToolbarAction, "new-package"> } | null>(null);
  const [pendingChoosePackageId, setPendingChoosePackageId] = useState<number | null>(null);
  const [pendingImportTarget, setPendingImportTarget] = useState<{ packageId: number; folderPath: string[] } | null>(null);
  const [pendingImportDialog, setPendingImportDialog] = useState<{
    target: { packageId: number; folderPath: string[] };
    files: File[];
  } | null>(null);
  const [pendingDeleteDialog, setPendingDeleteDialog] = useState<PendingDeleteDialog | null>(null);

  const [visibilityEditor, setVisibilityEditor] = useState<{
    packageId: number;
    draft: 0 | 1;
    saving: boolean;
    anchor: HTMLButtonElement | null;
  } | null>(null);
  const visibilityPopoverRef = useRef<HTMLDivElement | null>(null);
  const visibilityFirstInputRef = useRef<HTMLInputElement | null>(null);
  const [visibilityPos, setVisibilityPos] = useState<{ left: number; top: number } | null>(null);
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

  const findPackageById = useCallback((packageId: number) => {
    return packages.find(p => Number(p.packageId) === Number(packageId)) ?? null;
  }, [packages]);

  const saveMockList = useCallback((nextList: MaterialPackageRecord[]) => {
    writeMockPackages(nextList);
    queryClient.setQueryData(listQueryKey, nextList);
  }, [listQueryKey, queryClient]);

  const saveMockRecord = useCallback((nextRecord: MaterialPackageRecord) => {
    const now = new Date().toISOString();
    const base = Array.isArray(queryClient.getQueryData(listQueryKey))
      ? (queryClient.getQueryData(listQueryKey) as MaterialPackageRecord[])
      : readMockPackages();
    const nextList = (base ?? []).map(p => Number(p.packageId) === Number(nextRecord.packageId) ? { ...nextRecord, updateTime: now } : p);
    saveMockList(nextList);
    const detailKey = buildMaterialPackageDetailQueryKey(Number(nextRecord.packageId), useBackend);
    queryClient.setQueryData(detailKey, { ...nextRecord, updateTime: now });
  }, [queryClient, listQueryKey, saveMockList, useBackend]);

  const savePackageContent = useCallback(async (args: { packageId: number; nextContent: MaterialPackageContent }) => {
    const packageId = Number(args.packageId);
    const detailKey = buildMaterialPackageDetailQueryKey(packageId, useBackend);

    if (useBackend) {
      const updated = await updateMaterialPackage({ packageId, content: args.nextContent });
      queryClient.setQueryData(detailKey, updated);
      queryClient.setQueryData(listQueryKey, (prev) => {
        if (!Array.isArray(prev))
          return prev;
        const list = prev as MaterialPackageRecord[];
        return list.map(p => Number(p.packageId) === packageId ? updated : p);
      });
      return updated;
    }

    const base = findPackageById(packageId);
    if (!base)
      return null;
    const nextRecord: MaterialPackageRecord = { ...base, content: args.nextContent, updateTime: new Date().toISOString() };
    saveMockRecord(nextRecord);
    return nextRecord;
  }, [findPackageById, listQueryKey, queryClient, useBackend]);

  const closeVisibilityEditor = useCallback(() => {
    setVisibilityEditor((prev) => {
      if (!prev)
        return prev;
      try {
        prev.anchor?.focus?.();
      }
      catch {
        // ignore focus errors
      }
      return null;
    });
    setVisibilityPos(null);
  }, []);

  const computeVisibilityPos = useCallback((anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    const width = 320;
    const height = 188;
    const padding = 8;

    const preferBelowTop = rect.bottom + 6;
    const preferAboveTop = rect.top - height - 6;
    const top = preferBelowTop + height + padding <= window.innerHeight
      ? preferBelowTop
      : Math.max(padding, preferAboveTop);

    const preferLeft = rect.right - width;
    const left = Math.max(padding, Math.min(preferLeft, window.innerWidth - width - padding));

    return { left, top: Math.max(padding, Math.min(top, window.innerHeight - height - padding)) };
  }, []);

  const openVisibilityEditor = useCallback((args: { packageId: number; anchor: HTMLButtonElement; current: 0 | 1 }) => {
    setVisibilityEditor({
      packageId: Number(args.packageId),
      draft: normalizePackageVisibility(args.current),
      saving: false,
      anchor: args.anchor,
    });
    setVisibilityPos(computeVisibilityPos(args.anchor));
  }, [computeVisibilityPos]);

  useEffect(() => {
    if (!visibilityEditor?.anchor)
      return;
    setVisibilityPos(computeVisibilityPos(visibilityEditor.anchor));
  }, [computeVisibilityPos, visibilityEditor?.anchor]);

  useEffect(() => {
    if (!visibilityEditor)
      return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeVisibilityEditor();
      }
    };

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target)
        return;
      const pop = visibilityPopoverRef.current;
      if (pop && pop.contains(target))
        return;
      if (visibilityEditor.anchor && visibilityEditor.anchor.contains(target as Node))
        return;
      closeVisibilityEditor();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown, true);
    };
  }, [closeVisibilityEditor, visibilityEditor]);

  useEffect(() => {
    if (!visibilityEditor)
      return;
    const t = window.setTimeout(() => {
      try {
        visibilityFirstInputRef.current?.focus?.();
      }
      catch {
        // ignore focus errors
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [visibilityEditor]);

  const savePackageVisibility = useCallback(async (args: { packageId: number; visibility: 0 | 1 }) => {
    const packageId = Number(args.packageId);
    const visibility = normalizePackageVisibility(args.visibility);
    const detailKey = buildMaterialPackageDetailQueryKey(packageId, useBackend);

    if (useBackend) {
      const updated = await updateMaterialPackage({ packageId, visibility });
      queryClient.setQueryData(detailKey, updated);
      queryClient.setQueryData(listQueryKey, (prev) => {
        if (!Array.isArray(prev))
          return prev;
        const list = prev as MaterialPackageRecord[];
        return list.map(p => Number(p.packageId) === packageId ? updated : p);
      });
      return updated;
    }

    const baseList = Array.isArray(queryClient.getQueryData(listQueryKey))
      ? (queryClient.getQueryData(listQueryKey) as MaterialPackageRecord[])
      : readMockPackages();
    const baseRecord = baseList.find(p => Number(p.packageId) === packageId) ?? findPackageById(packageId);
    if (!baseRecord)
      return null;

    // For visibility toggles, keep list order stable and avoid bumping updateTime to prevent any sort-related surprises.
    const nextRecord: MaterialPackageRecord = { ...baseRecord, visibility };
    const nextList = baseList.map(p => Number(p.packageId) === packageId ? nextRecord : p);
    writeMockPackages(nextList);
    queryClient.setQueryData(listQueryKey, nextList);
    queryClient.setQueryData(detailKey, nextRecord);
    return nextRecord;
  }, [findPackageById, listQueryKey, queryClient, saveMockRecord, useBackend]);

  const ensureRevealNode = useCallback((payload: MaterialPreviewPayload) => {
    const packageId = Number(payload.packageId ?? 0);
    const path = Array.isArray(payload.path) ? payload.path : [];

    const keysToExpand: string[] = [];
    keysToExpand.push(`root:${packageId}`);
    for (let i = 0; i < path.length; i++) {
      const part = path[i];
      if (typeof part !== "string" || !part.startsWith("folder:"))
        continue;
      keysToExpand.push(buildNodeKey({ packageId, path: path.slice(0, i + 1) }));
    }

    setCollapsedByKey((prev) => {
      let changed = false;
      const next: Record<string, boolean> = { ...prev };
      for (const k of keysToExpand) {
        if (next[k] === true) {
          next[k] = false;
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    const targetKey = payload.kind === "package"
      ? `root:${packageId}`
      : buildNodeKey({ packageId, path });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const root = treeItemsRef.current;
        const el = root?.querySelector<HTMLElement>(`[data-node-key="${CSS.escape(targetKey)}"]`);
        el?.scrollIntoView({ block: "nearest" });
      });
    });
  }, []);

  const buildMessagesFromFile = useCallback(async (file: File) => {
    const lower = file.name.toLowerCase();
    const isImage = /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(lower);
    const isAudio = /\.(mp3|wav|ogg|flac|m4a)$/i.test(lower);
    const isText = /\.(txt|md)$/i.test(lower);

    if (isImage) {
      return [{
        messageType: 2,
        annotations: ["图片"],
        extra: { imageMessage: { url: useBackend ? "" : URL.createObjectURL(file), fileName: file.name } },
      }];
    }

    if (isAudio) {
      return [{
        messageType: 3,
        annotations: ["音频"],
        extra: { soundMessage: { url: useBackend ? "" : URL.createObjectURL(file), fileName: file.name } },
      }];
    }

    if (isText) {
      const text = await file.text().catch(() => "");
      return [{
        messageType: 1,
        content: text,
        annotations: ["文本"],
        extra: {},
      }];
    }

    return [{
      messageType: 1,
      content: file.name,
      annotations: ["文件"],
      extra: {},
    }];
  }, [useBackend]);

  const applyImportFiles = useCallback(async (args: {
    target: { packageId: number; folderPath: string[] };
    files: File[];
    policy: "overwrite" | "autoRename";
  }) => {
    const pkg = findPackageById(args.target.packageId);
    if (!pkg) {
      window.alert("目标素材箱不存在或已被刷新。");
      return;
    }
    const baseContent = pkg.content ?? buildEmptyMaterialPackageContent();
    const nodes = getFolderNodesAtPath(baseContent, args.target.folderPath);
    const existingByName = new Map(nodes.map(n => [n.name, n] as const));
    const usedNames = new Set(nodes.map(n => n.name));

    const overwrittenOnce = new Set<string>();
    let nextContent = baseContent;
    let lastInserted: { payload: MaterialPreviewPayload; key: string } | null = null;

    for (const file of args.files) {
      const baseName = file.name;
      const existing = existingByName.get(baseName);
      const canOverwrite = args.policy === "overwrite"
        && existing?.type === "material"
        && !overwrittenOnce.has(baseName);

      const messages = await buildMessagesFromFile(file);

      if (canOverwrite) {
        overwrittenOnce.add(baseName);
        nextContent = draftReplaceMaterialMessages(nextContent, args.target.folderPath, baseName, messages);
        const path = [...args.target.folderPath.map(n => `folder:${n}`), `material:${baseName}`];
        const payload = toPreviewPayload({
          kind: "material",
          packageId: args.target.packageId,
          label: baseName,
          path,
        });
        lastInserted = { payload, key: buildNodeKey({ packageId: args.target.packageId, path }) };
        continue;
      }

      let finalName = baseName;
      if (usedNames.has(finalName)) {
        finalName = autoRenameVsCodeLike(finalName, usedNames);
      }
      usedNames.add(finalName);

      const material: MaterialItemNode = { type: "material", name: finalName, note: "", messages };
      nextContent = draftCreateMaterial(nextContent, args.target.folderPath, material);
      const path = [...args.target.folderPath.map(n => `folder:${n}`), `material:${finalName}`];
      const payload = toPreviewPayload({
        kind: "material",
        packageId: args.target.packageId,
        label: finalName,
        path,
      });
      lastInserted = { payload, key: buildNodeKey({ packageId: args.target.packageId, path }) };
    }

    await savePackageContent({ packageId: args.target.packageId, nextContent });
    setPendingImportTarget(null);
    setPendingImportDialog(null);

    if (lastInserted) {
      setSelectedNode({ kind: "material", key: lastInserted.key, payload: lastInserted.payload });
      ensureRevealNode(lastInserted.payload);
    }
  }, [buildMessagesFromFile, ensureRevealNode, findPackageById, savePackageContent]);

  const runToolbarNewFile = useCallback(async (targetOverride?: { packageId: number; folderPath: string[] }) => {
    const resolved = targetOverride
      ? ({ status: "ok", packageId: targetOverride.packageId, folderPath: targetOverride.folderPath } as const)
      : resolveTarget({ selectedNode, packages, defaultTargetPackageId });
    if (resolved.status === "blocked") {
      window.alert("请先创建一个素材箱。");
      return;
    }
    if (resolved.status === "need-choose-package") {
      setPendingChoosePackage({ action: "new-file" });
      return;
    }

    const pkg = findPackageById(resolved.packageId);
    if (!pkg) {
      window.alert("目标素材箱不存在或已被刷新。");
      return;
    }
    const baseContent = pkg.content ?? buildEmptyMaterialPackageContent();
    const nodes = getFolderNodesAtPath(baseContent, resolved.folderPath);
    const usedNames = nodes.map(n => n.name);

    const name = window.prompt("新建文件名（可带任意后缀）", "新文件.txt");
    const trimmed = (name ?? "").trim();
    if (!trimmed)
      return;
    const finalName = autoRenameVsCodeLike(trimmed, usedNames);
    if (finalName !== trimmed) {
      window.alert(`名称已存在，已自动重命名为「${finalName}」。`);
    }

    const material: MaterialItemNode = { type: "material", name: finalName, note: "", messages: [] };
    const nextContent = draftCreateMaterial(baseContent, resolved.folderPath, material);
    await savePackageContent({ packageId: resolved.packageId, nextContent });

    const path = [...resolved.folderPath.map(n => `folder:${n}`), `material:${finalName}`];
    const payload = toPreviewPayload({ kind: "material", packageId: resolved.packageId, label: finalName, path });
    const key = buildNodeKey({ packageId: resolved.packageId, path });
    setSelectedNode({ kind: "material", key, payload });
    ensureRevealNode(payload);
  }, [defaultTargetPackageId, ensureRevealNode, findPackageById, packages, savePackageContent, selectedNode]);

  const runToolbarNewFolder = useCallback(async (targetOverride?: { packageId: number; folderPath: string[] }) => {
    const resolved = targetOverride
      ? ({ status: "ok", packageId: targetOverride.packageId, folderPath: targetOverride.folderPath } as const)
      : resolveTarget({ selectedNode, packages, defaultTargetPackageId });
    if (resolved.status === "blocked") {
      window.alert("请先创建一个素材箱。");
      return;
    }
    if (resolved.status === "need-choose-package") {
      setPendingChoosePackage({ action: "new-folder" });
      return;
    }

    const pkg = findPackageById(resolved.packageId);
    if (!pkg) {
      window.alert("目标素材箱不存在或已被刷新。");
      return;
    }
    const baseContent = pkg.content ?? buildEmptyMaterialPackageContent();
    const nodes = getFolderNodesAtPath(baseContent, resolved.folderPath);
    const usedNames = nodes.map(n => n.name);

    const name = window.prompt("新建文件夹名称", "新建文件夹");
    const trimmed = (name ?? "").trim();
    if (!trimmed)
      return;
    const finalName = autoRenameVsCodeLike(trimmed, usedNames);
    if (finalName !== trimmed) {
      window.alert(`名称已存在，已自动重命名为「${finalName}」。`);
    }

    const nextContent = draftCreateFolder(baseContent, resolved.folderPath, finalName);
    await savePackageContent({ packageId: resolved.packageId, nextContent });

    const path = [...resolved.folderPath.map(n => `folder:${n}`), `folder:${finalName}`];
    const payload = toPreviewPayload({ kind: "folder", packageId: resolved.packageId, label: finalName, path });
    const key = buildNodeKey({ packageId: resolved.packageId, path });
    setSelectedNode({ kind: "folder", key, payload });
    ensureRevealNode(payload);
  }, [defaultTargetPackageId, ensureRevealNode, findPackageById, packages, savePackageContent, selectedNode]);

  const handleToolbarNewPackage = useCallback(async () => {
    const baseNames = packages.map(p => p.name ?? "");
    const name = window.prompt("新建素材箱名称", "新素材箱");
    const trimmed = (name ?? "").trim();
    if (!trimmed)
      return;
    const finalName = autoRenameVsCodeLike(trimmed, baseNames);
    if (finalName !== trimmed) {
      window.alert(`名称已存在，已自动重命名为「${finalName}」。`);
    }

    const content = buildEmptyMaterialPackageContent();

    if (useBackend) {
      const created = await createMaterialPackage({ name: finalName, content });
      setDefaultTargetPackageId(Number(created.packageId));
      queryClient.setQueryData(buildMaterialPackageDetailQueryKey(Number(created.packageId), useBackend), created);
      queryClient.setQueryData(listQueryKey, (prev) => {
        if (!Array.isArray(prev))
          return [created];
        return [created, ...(prev as MaterialPackageRecord[])];
      });
      const key = `root:${Number(created.packageId)}`;
      const payload = toPreviewPayload({ kind: "package", packageId: Number(created.packageId), label: created.name, path: [] });
      setSelectedNode({ kind: "package", key, payload });
      ensureRevealNode(payload);
      return;
    }

    const now = new Date().toISOString();
    const base = Array.isArray(queryClient.getQueryData(listQueryKey))
      ? (queryClient.getQueryData(listQueryKey) as MaterialPackageRecord[])
      : readMockPackages();
    const nextId = (base ?? []).reduce((acc, p) => Math.max(acc, Number(p.packageId) || 0), 0) + 1;
    const created: MaterialPackageRecord = {
      packageId: nextId,
      userId: 0,
      name: finalName,
      description: "",
      coverUrl: null,
      visibility: 1,
      status: 0,
      importCount: 0,
      createTime: now,
      updateTime: now,
      content,
    };
    const nextList = [created, ...(base ?? [])];
    saveMockList(nextList);
    queryClient.setQueryData(buildMaterialPackageDetailQueryKey(nextId, useBackend), created);
    setDefaultTargetPackageId(nextId);
    const key = `root:${nextId}`;
    const payload = toPreviewPayload({ kind: "package", packageId: nextId, label: created.name, path: [] });
    setSelectedNode({ kind: "package", key, payload });
    ensureRevealNode(payload);
  }, [ensureRevealNode, listQueryKey, packages, queryClient, saveMockList, useBackend]);

  const handleToolbarImport = useCallback(() => {
    const resolved = resolveTarget({ selectedNode, packages, defaultTargetPackageId });
    if (resolved.status === "blocked") {
      window.alert("请先创建一个素材箱。");
      return;
    }
    if (resolved.status === "need-choose-package") {
      setPendingChoosePackage({ action: "import" });
      return;
    }
    setPendingImportTarget({ packageId: resolved.packageId, folderPath: resolved.folderPath });
    const el = importInputRef.current;
    if (!el)
      return;
    el.value = "";
    el.click();
  }, [defaultTargetPackageId, packages, selectedNode]);

  const handleImportChange = useCallback(async () => {
    const el = importInputRef.current;
    if (!el)
      return;
    const files = Array.from(el.files || []);
    if (!files.length)
      return;

    const target = pendingImportTarget ?? ((): { packageId: number; folderPath: string[] } | null => {
      const resolved = resolveTarget({ selectedNode, packages, defaultTargetPackageId });
      if (resolved.status !== "ok")
        return null;
      return { packageId: resolved.packageId, folderPath: resolved.folderPath };
    })();

    if (!target) {
      window.alert("请选择一个素材箱后再导入。");
      return;
    }

    const pkg = findPackageById(target.packageId);
    const baseContent = pkg?.content ?? buildEmptyMaterialPackageContent();
    const nodes = getFolderNodesAtPath(baseContent, target.folderPath);
    const existingNames = new Set(nodes.map(n => n.name));
    const folderNames = new Set(nodes.filter(n => n.type === "folder").map(n => n.name));
    const seenInBatch = new Set<string>();

    let hasConflict = false;
    for (const f of files) {
      if (existingNames.has(f.name) || seenInBatch.has(f.name) || folderNames.has(f.name)) {
        hasConflict = true;
        break;
      }
      seenInBatch.add(f.name);
    }

    if (hasConflict) {
      setPendingImportDialog({ target, files });
      return;
    }

    await applyImportFiles({ target, files, policy: "autoRename" });
  }, [applyImportFiles, defaultTargetPackageId, findPackageById, packages, pendingImportTarget, selectedNode]);

  const handleToolbarRefresh = useCallback(() => {
    setShouldResortPackages(true);
    packagesQuery.refetch();
  }, [packagesQuery]);

  const handleToolbarDelete = useCallback(() => {
    if (!selectedNode?.payload) {
      window.alert("请先选择一个文件/文件夹/素材箱。");
      return;
    }

    const packageId = Number(selectedNode.payload.packageId ?? 0);
    const pkg = findPackageById(packageId);
    if (!pkg) {
      window.alert("目标素材箱不存在或已被刷新。");
      return;
    }

    if (selectedNode.kind === "package") {
      setPendingDeleteDialog({
        kind: "package",
        packageId,
        label: pkg.name ?? `素材包#${packageId}`,
        saving: false,
      });
      return;
    }

    const folderPath = payloadPathToFolderNames(selectedNode.payload.path);
    if (selectedNode.kind === "folder") {
      const label = folderPath[folderPath.length - 1] ?? selectedNode.payload.label ?? "文件夹";
      setPendingDeleteDialog({
        kind: "folder",
        packageId,
        folderPath,
        label,
        saving: false,
      });
      return;
    }

    const materialName = payloadPathToMaterialName(selectedNode.payload.path) ?? selectedNode.payload.label ?? "";
    if (!materialName) {
      window.alert("无法解析要删除的文件名称。");
      return;
    }
    setPendingDeleteDialog({
      kind: "material",
      packageId,
      folderPath,
      materialName,
      label: materialName,
      saving: false,
    });
  }, [findPackageById, selectedNode?.kind, selectedNode?.payload]);

  const runDeleteConfirmed = useCallback(async (dialog: PendingDeleteDialog) => {
    if (dialog.kind === "package") {
      setPendingDeleteDialog(prev => prev ? { ...prev, saving: true } as PendingDeleteDialog : prev);
      try {
        const packageId = Number(dialog.packageId);
        const detailKey = buildMaterialPackageDetailQueryKey(packageId, useBackend);

        if (useBackend) {
          await deleteMaterialPackage(packageId);
        }
        else {
          const base = Array.isArray(queryClient.getQueryData(listQueryKey))
            ? (queryClient.getQueryData(listQueryKey) as MaterialPackageRecord[])
            : readMockPackages();
          const nextList = (base ?? []).filter(p => Number(p.packageId) !== packageId);
          writeMockPackages(nextList);
          queryClient.setQueryData(listQueryKey, nextList);
        }

        queryClient.removeQueries({ queryKey: detailKey });
        queryClient.setQueryData(listQueryKey, (prev) => {
          if (!Array.isArray(prev))
            return prev;
          const list = prev as MaterialPackageRecord[];
          return list.filter(p => Number(p.packageId) !== packageId);
        });

        setCollapsedByKey((prev) => {
          const next: Record<string, boolean> = {};
          const rootPrefix = `root:${packageId}`;
          const folderPrefix = `pkg:${packageId}:`;
          Object.entries(prev).forEach(([key, value]) => {
            if (key === rootPrefix || key.startsWith(folderPrefix))
              return;
            next[key] = value;
          });
          return next;
        });

        setPendingDeleteDialog(null);
        setVisibilityEditor((prev) => (prev?.packageId === packageId ? null : prev));

        setSelectedNode((prev) => {
          if (!prev)
            return prev;
          if (Number(prev.payload.packageId ?? 0) === packageId)
            return null;
          return prev;
        });
        setDefaultTargetPackageId((prev) => (Number(prev ?? 0) === packageId ? null : prev));
      }
      catch (error) {
        setPendingDeleteDialog(prev => prev ? { ...prev, saving: false } as PendingDeleteDialog : prev);
        const message = error instanceof Error ? error.message : "删除失败";
        window.alert(message);
      }

      return;
    }

    if (dialog.kind === "folder") {
      const folderName = dialog.folderPath[dialog.folderPath.length - 1] ?? dialog.label;
      setPendingDeleteDialog(prev => prev ? { ...prev, saving: true } as PendingDeleteDialog : prev);
      try {
        const pkg = findPackageById(dialog.packageId);
        if (!pkg)
          throw new Error("目标素材箱不存在或已被刷新。");
        const baseContent = pkg.content ?? buildEmptyMaterialPackageContent();
        const parentPath = dialog.folderPath.slice(0, -1);
        const nextContent = draftDeleteFolder(baseContent, parentPath, folderName);
        await savePackageContent({ packageId: dialog.packageId, nextContent });

        const packageLabel = pkg.name ?? `素材包#${dialog.packageId}`;
        const payload = toPreviewPayload({ kind: "package", packageId: dialog.packageId, label: packageLabel, path: [] });
        setSelectedNode({ kind: "package", key: `root:${dialog.packageId}`, payload });
        ensureRevealNode(payload);
        setPendingDeleteDialog(null);
      }
      catch (error) {
        setPendingDeleteDialog(prev => prev ? { ...prev, saving: false } as PendingDeleteDialog : prev);
        const message = error instanceof Error ? error.message : "删除失败";
        window.alert(message);
      }

      return;
    }

    setPendingDeleteDialog(prev => prev ? { ...prev, saving: true } as PendingDeleteDialog : prev);
    try {
      const pkg = findPackageById(dialog.packageId);
      if (!pkg)
        throw new Error("目标素材箱不存在或已被刷新。");
      const baseContent = pkg.content ?? buildEmptyMaterialPackageContent();
      const nextContent = draftDeleteMaterial(baseContent, dialog.folderPath, dialog.materialName);
      await savePackageContent({ packageId: dialog.packageId, nextContent });

      const packageLabel = pkg.name ?? `素材包#${dialog.packageId}`;
      const payload = toPreviewPayload({ kind: "package", packageId: dialog.packageId, label: packageLabel, path: [] });
      setSelectedNode({ kind: "package", key: `root:${dialog.packageId}`, payload });
      ensureRevealNode(payload);
      setPendingDeleteDialog(null);
    }
    catch (error) {
      setPendingDeleteDialog(prev => prev ? { ...prev, saving: false } as PendingDeleteDialog : prev);
      const message = error instanceof Error ? error.message : "删除失败";
      window.alert(message);
    }
  }, [ensureRevealNode, findPackageById, listQueryKey, queryClient, savePackageContent, setCollapsedByKey, useBackend]);

  const handleToolbarReveal = useCallback(() => {
    if (selectedNode?.payload) {
      ensureRevealNode(selectedNode.payload);
      return;
    }
    if (defaultTargetPackageId != null) {
      const pkg = findPackageById(defaultTargetPackageId);
      if (!pkg)
        return;
      const payload = toPreviewPayload({ kind: "package", packageId: Number(pkg.packageId), label: pkg.name ?? `素材包#${pkg.packageId}`, path: [] });
      ensureRevealNode(payload);
      return;
    }
    if (packages.length === 1) {
      const pkg = packages[0]!;
      const payload = toPreviewPayload({ kind: "package", packageId: Number(pkg.packageId), label: pkg.name ?? `素材包#${pkg.packageId}`, path: [] });
      ensureRevealNode(payload);
    }
  }, [defaultTargetPackageId, ensureRevealNode, findPackageById, packages, selectedNode]);

  const handleToolbarNewFile = useCallback(() => {
    void runToolbarNewFile();
  }, [runToolbarNewFile]);

  const handleToolbarNewFolder = useCallback(() => {
    void runToolbarNewFolder();
  }, [runToolbarNewFolder]);

  useEffect(() => {
    if (!pendingChoosePackage)
      return;
    const first = packages[0]?.packageId ?? null;
    setPendingChoosePackageId(first != null ? Number(first) : null);
  }, [packages, pendingChoosePackage]);

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
      const isSelected = selectedNode?.key === item.key;
      const packageId = Number(item.payload.packageId);
      const pkg = findPackageById(packageId);
      const visibility = normalizePackageVisibility(pkg?.visibility);
      const visibilityCopy = getVisibilityCopy(visibility);
      const isVisibilityOpen = visibilityEditor?.packageId === packageId;
      return (
        <div
          key={item.key}
          className="px-1 rounded-md"
          data-role="material-package-visible-row"
          data-base-index={item.baseIndex}
        >
          <div
            className={`flex items-center gap-1 py-1 pr-1 text-xs font-medium opacity-90 select-none rounded-md ${isSelected ? "bg-base-300/60 ring-1 ring-info/20" : "hover:bg-base-300/40"}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "copy";
              setMaterialPreviewDragData(e.dataTransfer, item.payload);
              setMaterialPreviewDragOrigin(e.dataTransfer, "tree");
            }}
            onClick={(e) => {
              setSelectedNode({ kind: "package", key: item.key, payload: item.payload });
              maybeOpenPreviewByDoubleClick(e, item.key, item.payload);
            }}
            onDoubleClick={() => openPreview(item.payload, null)}
            data-node-key={item.key}
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
            <button
              type="button"
              className={`shrink-0 inline-flex items-center rounded-sm border px-2 py-[1px] text-[11px] ${visibility ? "border-info/40 text-info" : "border-base-300 opacity-80"} ${isVisibilityOpen ? "bg-base-300/60" : "hover:bg-base-300/40"}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openVisibilityEditor({ packageId, anchor: e.currentTarget, current: visibility });
              }}
              title={visibilityCopy.title}
              aria-label={`可见性：${visibilityCopy.chip}，点击修改`}
            >
              {visibilityCopy.chip}
            </button>
          </div>
        </div>
      );
    }

    if (item.kind === "folder") {
      const isSelected = selectedNode?.key === item.key;
      return (
        <div
          key={item.key}
          className="px-1 rounded-md"
          data-role="material-package-visible-row"
          data-base-index={item.baseIndex}
        >
          <div
            className={`flex items-center gap-1 py-1 pr-1 text-xs font-medium opacity-85 select-none rounded-md ${isSelected ? "bg-base-300/60 ring-1 ring-info/20" : "hover:bg-base-300/40"}`}
            style={{ paddingLeft: `${item.depth + 2}px` }}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "copy";
              setMaterialPreviewDragData(e.dataTransfer, item.payload);
              setMaterialPreviewDragOrigin(e.dataTransfer, "tree");
            }}
            onClick={(e) => {
              setSelectedNode({ kind: "folder", key: item.key, payload: item.payload });
              maybeOpenPreviewByDoubleClick(e, item.key, item.payload);
            }}
            onDoubleClick={() => openPreview(item.payload, null)}
            data-node-key={item.key}
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
        className={`flex items-center gap-2 py-1 pr-2 text-xs opacity-85 select-none rounded-md ${selectedNode?.key === item.key ? "bg-base-300/60 ring-1 ring-info/20" : "hover:bg-base-300/40"}`}
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
          setSelectedNode({ kind: "material", key: item.key, payload: item.payload });
          maybeOpenPreviewByDoubleClick(e, item.key, item.payload);
        }}
        onDoubleClick={() => openPreview(item.payload, null)}
        data-node-key={item.key}
      >
        <FileImageIcon className="size-4 opacity-70" />
        <span className="flex-1 truncate">{item.name}</span>
      </div>
    );
  }, [dockedPreview, findPackageById, maybeOpenPreviewByDoubleClick, onDockPreview, onOpenPreview, onUndockPreview, openPreview, openVisibilityEditor, resolvedDockIndex, selectedNode?.key, toggleCollapsed, visibilityEditor?.packageId]);

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
          if (dockHint) {
            applyDockHint(dockHint);
          }
          if (visibilityEditor?.anchor) {
            setVisibilityPos(computeVisibilityPos(visibilityEditor.anchor));
          }
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
            <div className="sticky top-0 z-20 -mx-3 px-3 py-2 bg-base-200/95 backdrop-blur border-b border-base-300">
              <div className="px-1 flex items-center justify-between gap-2 group">
                  <button
                    type="button"
                    className="text-[11px] font-semibold tracking-wider text-base-content/50 hover:text-base-content/70 active:text-base-content/80 select-none"
                    onClick={() => setToolbarPinned(!toolbarPinned)}
                    aria-pressed={toolbarPinned}
                    title={toolbarPinned ? "隐藏工具栏（仍可悬浮显示）" : "固定显示工具栏"}
                  >
                    TUAN-CHAT
                  </button>
                  <div
                    className={`flex items-center gap-1 transition-opacity ${toolbarPinned ? "opacity-90" : "opacity-0 pointer-events-none group-hover:opacity-70 group-hover:pointer-events-auto focus-within:opacity-90 focus-within:pointer-events-auto"}`}
                  >
                  <PortalTooltip label="新建文件" placement="bottom">
                    <button type="button" className="btn btn-ghost btn-xs btn-square" disabled={packages.length === 0} onClick={handleToolbarNewFile} aria-label="新建文件">
                      <FilePlus className="size-4" />
                    </button>
                  </PortalTooltip>
                  <PortalTooltip label="新建文件夹" placement="bottom">
                    <button type="button" className="btn btn-ghost btn-xs btn-square" disabled={packages.length === 0} onClick={handleToolbarNewFolder} aria-label="新建文件夹">
                      <FolderPlus className="size-4" />
                    </button>
                  </PortalTooltip>
                  <PortalTooltip label="新建素材箱" placement="bottom">
                    <button type="button" className="btn btn-ghost btn-xs btn-square" onClick={handleToolbarNewPackage} aria-label="新建素材箱">
                      <Plus className="size-4" />
                    </button>
                  </PortalTooltip>
                  <PortalTooltip label="本地导入" placement="bottom">
                    <button type="button" className="btn btn-ghost btn-xs btn-square" disabled={packages.length === 0} onClick={handleToolbarImport} aria-label="本地导入">
                      <UploadSimple className="size-4" />
                    </button>
                  </PortalTooltip>
                  <PortalTooltip label="刷新" placement="bottom">
                    <button type="button" className="btn btn-ghost btn-xs btn-square" onClick={handleToolbarRefresh} aria-label="刷新">
                      <ArrowClockwise className="size-4" />
                    </button>
                  </PortalTooltip>
                  <PortalTooltip label={selectedNode ? "删除" : "先选择一个节点再删除"} placement="bottom">
                    <button type="button" className="btn btn-ghost btn-xs btn-square" disabled={!selectedNode} onClick={handleToolbarDelete} aria-label="删除">
                      <TrashIcon className="size-4" />
                    </button>
                  </PortalTooltip>
                  <PortalTooltip label="展开到选中项" placement="bottom">
                    <button type="button" className="btn btn-ghost btn-xs btn-square" disabled={packages.length === 0} onClick={handleToolbarReveal} aria-label="展开到选中项">
                      <CrosshairSimple className="size-4" />
                    </button>
                  </PortalTooltip>
                </div>
              </div>
            </div>

            <div ref={treeItemsRef} data-role="material-package-tree-items">
              <input ref={importInputRef} type="file" className="hidden" multiple onChange={handleImportChange} />
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

      {pendingChoosePackage ? (
        <dialog
          open
          className="modal modal-open"
          onCancel={(event) => {
            event.preventDefault();
            setPendingChoosePackage(null);
            setPendingChoosePackageId(null);
          }}
        >
          <div className="modal-box max-w-[420px] border border-base-300 bg-base-100 p-0 text-base-content shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-base-300 px-4 py-3">
              <div className="text-sm font-semibold">选择素材箱</div>
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-square"
                aria-label="关闭"
                onClick={() => {
                  setPendingChoosePackage(null);
                  setPendingChoosePackageId(null);
                }}
              >
                ✕
              </button>
            </div>
            <div className="px-4 py-3 space-y-3">
              <div className="text-xs opacity-70">
                当前有多个素材箱，请先选择一个作为默认操作位置。
              </div>
              <div className="space-y-2">
                {packages.map((pkg) => {
                  const id = Number(pkg.packageId);
                  const label = pkg.name ?? `素材包#${id}`;
                  return (
                    <label key={id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        className="radio radio-sm"
                        name="choose-package"
                        checked={Number(pendingChoosePackageId) === id}
                        onChange={() => setPendingChoosePackageId(id)}
                      />
                      <span className="truncate">{label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-base-300 px-4 py-3">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setPendingChoosePackage(null);
                  setPendingChoosePackageId(null);
                }}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={pendingChoosePackageId == null}
                onClick={() => {
                  if (pendingChoosePackageId == null)
                    return;
                  const packageId = Number(pendingChoosePackageId);
                  setDefaultTargetPackageId(packageId);
                  const key = `root:${packageId}`;
                  const label = findPackageById(packageId)?.name ?? `素材包#${packageId}`;
                  const payload = toPreviewPayload({ kind: "package", packageId, label, path: [] });
                  setSelectedNode({ kind: "package", key, payload });
                  setPendingChoosePackage(null);
                  setPendingChoosePackageId(null);

                  if (pendingChoosePackage.action === "new-file") {
                    void runToolbarNewFile({ packageId, folderPath: [] });
                  }
                  else if (pendingChoosePackage.action === "new-folder") {
                    void runToolbarNewFolder({ packageId, folderPath: [] });
                  }
                  else {
                    setPendingImportTarget({ packageId, folderPath: [] });
                    const el = importInputRef.current;
                    if (el) {
                      el.value = "";
                      el.click();
                    }
                  }
                }}
              >
                确定
              </button>
            </div>
          </div>
        </dialog>
      ) : null}

      {pendingDeleteDialog ? (
        <dialog
          open
          className="modal modal-open"
          onCancel={(event) => {
            event.preventDefault();
            if (pendingDeleteDialog.saving)
              return;
            setPendingDeleteDialog(null);
          }}
        >
          <div className="modal-box max-w-[460px] border border-base-300 bg-base-100 p-0 text-base-content shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-base-300 px-4 py-3">
              <div className="text-sm font-semibold">确认删除</div>
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-square"
                aria-label="关闭"
                onClick={() => {
                  if (pendingDeleteDialog.saving)
                    return;
                  setPendingDeleteDialog(null);
                }}
              >
                ✕
              </button>
            </div>
            <div className="px-4 py-4 space-y-2">
              <div className="text-sm">
                {pendingDeleteDialog.kind === "package" && (
                  <>将删除素材箱「{pendingDeleteDialog.label}」及其全部内容。</>
                )}
                {pendingDeleteDialog.kind === "folder" && (
                  <>将删除文件夹「{pendingDeleteDialog.label}」及其全部内容。</>
                )}
                {pendingDeleteDialog.kind === "material" && (
                  <>将删除文件「{pendingDeleteDialog.label}」。</>
                )}
              </div>
              <div className="text-xs opacity-70">
                该操作不可撤销。
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-base-300 px-4 py-3">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setPendingDeleteDialog(null)}
                disabled={pendingDeleteDialog.saving}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-error btn-sm"
                onClick={() => void runDeleteConfirmed(pendingDeleteDialog)}
                disabled={pendingDeleteDialog.saving}
              >
                {pendingDeleteDialog.saving ? "删除中…" : "删除"}
              </button>
            </div>
          </div>
        </dialog>
      ) : null}

      {visibilityEditor && visibilityPos && typeof document !== "undefined" && createPortal(
        <div
          ref={visibilityPopoverRef}
          className="z-[9999] w-[320px] overflow-hidden rounded-md border border-base-300 bg-base-100 text-base-content shadow-xl"
          style={{
            position: "fixed",
            left: visibilityPos.left,
            top: visibilityPos.top,
          }}
          role="dialog"
          aria-label="可见性设置"
        >
          <div className="flex items-center justify-between gap-3 border-b border-base-300 px-3 py-2">
            <div className="text-[13px] font-semibold">可见性</div>
            <button
              type="button"
              className="btn btn-ghost btn-xs btn-square"
              aria-label="关闭"
              onClick={() => closeVisibilityEditor()}
              disabled={visibilityEditor.saving}
            >
              ✕
            </button>
          </div>

          <div className="px-3 py-3 space-y-3">
            <div className="text-xs opacity-70 truncate" title={findPackageById(visibilityEditor.packageId)?.name ?? ""}>
              {findPackageById(visibilityEditor.packageId)?.name ?? `素材包#${visibilityEditor.packageId}`}
            </div>

            <fieldset className="space-y-2">
              <legend className="sr-only">可见性选项</legend>

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  ref={visibilityFirstInputRef}
                  type="radio"
                  className="radio radio-sm mt-0.5"
                  name="material-package-visibility"
                  checked={visibilityEditor.draft === 1}
                  onChange={() => setVisibilityEditor(prev => prev ? { ...prev, draft: 1 } : prev)}
                  disabled={visibilityEditor.saving}
                />
                <div className="min-w-0">
                  <div className="text-sm">公开（发布到素材广场）</div>
                  <div className="text-[11px] opacity-70">素材包会出现在素材广场，其他人可以查看并获取。</div>
                </div>
              </label>

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  className="radio radio-sm mt-0.5"
                  name="material-package-visibility"
                  checked={visibilityEditor.draft === 0}
                  onChange={() => setVisibilityEditor(prev => prev ? { ...prev, draft: 0 } : prev)}
                  disabled={visibilityEditor.saving}
                />
                <div className="min-w-0">
                  <div className="text-sm">私有（不在素材广场展示）</div>
                  <div className="text-[11px] opacity-70">素材包仍保留在“我的素材包”里，但不会出现在素材广场。</div>
                </div>
              </label>
            </fieldset>
          </div>

          <div className="flex justify-end gap-2 border-t border-base-300 px-3 py-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => closeVisibilityEditor()}
              disabled={visibilityEditor.saving}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={visibilityEditor.saving || normalizePackageVisibility(findPackageById(visibilityEditor.packageId)?.visibility) === normalizePackageVisibility(visibilityEditor.draft)}
              onClick={async () => {
                if (visibilityEditor.saving)
                  return;
                const current = normalizePackageVisibility(findPackageById(visibilityEditor.packageId)?.visibility);
                const next = normalizePackageVisibility(visibilityEditor.draft);
                if (current === next)
                  return;
                setVisibilityEditor(prev => prev ? { ...prev, saving: true } : prev);
                try {
                  await savePackageVisibility({ packageId: visibilityEditor.packageId, visibility: next });
                  closeVisibilityEditor();
                }
                catch (error) {
                  setVisibilityEditor(prev => prev ? { ...prev, saving: false } : prev);
                  const message = error instanceof Error ? error.message : "保存失败";
                  window.alert(message);
                }
              }}
            >
              {visibilityEditor.saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>,
        document.body,
      )}

      {pendingImportDialog ? (
        <dialog
          open
          className="modal modal-open"
          onCancel={(event) => {
            event.preventDefault();
            setPendingImportDialog(null);
          }}
        >
          <div className="modal-box max-w-[460px] border border-base-300 bg-base-100 p-0 text-base-content shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-base-300 px-4 py-3">
              <div className="text-sm font-semibold">检测到重名文件</div>
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-square"
                aria-label="关闭"
                onClick={() => setPendingImportDialog(null)}
              >
                ✕
              </button>
            </div>
            <div className="px-4 py-3 space-y-3">
              <div className="text-xs opacity-70">
                导入的文件名与当前目录已有内容或本次导入的其它文件重名。请选择处理方式：
              </div>
              <div className="text-xs opacity-60">
                目标：{findPackageById(pendingImportDialog.target.packageId)?.name ?? `素材包#${pendingImportDialog.target.packageId}`}{pendingImportDialog.target.folderPath.length ? ` / ${pendingImportDialog.target.folderPath.join(" / ")}` : ""}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-base-300 px-4 py-3">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPendingImportDialog(null)}>取消</button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  void applyImportFiles({ target: pendingImportDialog.target, files: pendingImportDialog.files, policy: "autoRename" });
                }}
              >
                自动重命名
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  void applyImportFiles({ target: pendingImportDialog.target, files: pendingImportDialog.files, policy: "overwrite" });
                }}
              >
                覆盖
              </button>
            </div>
          </div>
        </dialog>
      ) : null}
    </div>
  );
}
