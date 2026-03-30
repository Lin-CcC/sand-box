import type {
  MaterialItemNode,
  MaterialNode,
  MaterialPackageContent,
  MaterialPackageRecord,
} from "@/components/materialPackage/materialPackageApi";
import type { MaterialPreviewPayload } from "@/components/chat/materialPackage/materialPackageDnd";

import { ChevronDown, FolderIcon, XMarkICon } from "@/icons";
import {
  ArrowLineDownIcon,
  ArrowLineUpIcon,
  ArrowSquareOutIcon,
  FileImageIcon,
  FolderPlusIcon,
  ListBulletsIcon,
  PackageIcon,
  PencilSimpleIcon,
  PlusIcon,
  SquareIcon,
  SquaresFourIcon,
  TrashIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import {
  createMaterialPackage,
  deleteMaterialPackage,
  getMaterialPackage,
  getMyMaterialPackages,
  updateMaterialPackage,
} from "@/components/materialPackage/materialPackageApi";
import PortalTooltip from "@/components/common/portalTooltip";
import { readMockPackages, writeMockPackages } from "@/components/chat/materialPackage/materialPackageMockStore";
import type { MaterialPreviewDragOrigin } from "@/components/chat/materialPackage/materialPackageDnd";
import { setMaterialPreviewDragData, setMaterialPreviewDragOrigin } from "@/components/chat/materialPackage/materialPackageDnd";
import { useLocalStorage } from "@/components/common/customHooks/useLocalStorage";
import { buildMaterialPackageDetailQueryKey, buildMaterialPackageMyQueryKey } from "@/components/chat/materialPackage/materialPackageQueries";
import {
  getFolderNodesAtPath,
  resolveInitialPreviewState,
} from "@/components/chat/materialPackage/materialPackageTree";
import {
  buildEmptyMaterialPackageContent,
  draftCreateFolder,
  draftCreateMaterial,
  draftDeleteFolder,
  draftDeleteMaterial,
  draftRenameFolder,
  draftRenameMaterial,
} from "@/components/chat/materialPackage/materialPackageDraft";

interface MaterialPreviewFloatProps {
  variant?: "float" | "embedded";
  payload: MaterialPreviewPayload;
  onClose: () => void;
  onDock: (payload: MaterialPreviewPayload, options?: { index?: number; placement?: "top" | "bottom" }) => void;
  onPopout?: (payload: MaterialPreviewPayload) => void;
  dragOrigin?: MaterialPreviewDragOrigin;
  initialPosition?: { x: number; y: number } | null;
}

type SelectedItem = { type: "folder" | "material"; name: string } | null;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function MaterialPreviewFloat({
  variant = "float",
  payload,
  onClose,
  onDock,
  onPopout,
  dragOrigin,
  initialPosition,
}: MaterialPreviewFloatProps) {
  const isEmbedded = variant === "embedded";
  const isDockedEmbedded = isEmbedded && dragOrigin === "docked";
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ active: boolean; offsetX: number; offsetY: number }>({ active: false, offsetX: 0, offsetY: 0 });
  const coverDragPendingRef = useRef<{
    active: boolean;
    startClientX: number;
    startClientY: number;
    offsetX: number;
    offsetY: number;
  }>({ active: false, startClientX: 0, startClientY: 0, offsetX: 0, offsetY: 0 });
  const pointerRef = useRef<{
    pointerId: number | null;
    mode: "none" | "coverPending" | "drag" | "resize";
    startClientX: number;
    startClientY: number;
    offsetX: number;
    offsetY: number;
  }>({ pointerId: null, mode: "none", startClientX: 0, startClientY: 0, offsetX: 0, offsetY: 0 });
  const resizeRef = useRef<{ active: boolean; startX: number; startY: number; startW: number; startH: number }>({
    active: false,
    startX: 0,
    startY: 0,
    startW: 0,
    startH: 0,
  });
  const coverObserverRef = useRef<ResizeObserver | null>(null);
  const isCoverModeRef = useRef<boolean>(initialPosition == null);
  const [pos, setPos] = useState(() => {
    if (isEmbedded)
      return { x: 0, y: 0 };
    if (initialPosition == null)
      return { x: 0, y: 0 };
    const x = initialPosition.x ?? 40;
    const y = initialPosition.y ?? 32;
    return { x, y };
  });
  const [shellSize, setShellSize] = useState(() => ({ w: 860, h: isEmbedded ? 360 : 420 }));
  const [isCoverMode, setIsCoverMode] = useState<boolean>(() => !isEmbedded && initialPosition == null);

  const setCoverMode = useCallback((next: boolean) => {
    isCoverModeRef.current = next;
    setIsCoverMode(next);
    if (!next) {
      coverObserverRef.current?.disconnect();
      coverObserverRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isEmbedded)
      return;
    if (!initialPosition)
      return;
    setPos({
      x: initialPosition.x,
      y: initialPosition.y,
    });
    setCoverMode(false);
  }, [initialPosition?.x, initialPosition?.y, isEmbedded, setCoverMode]);

  const syncCoverToParent = useCallback(() => {
    if (!isCoverModeRef.current)
      return;
    const container = containerRef.current;
    const parent = container?.parentElement;
    if (!container || !parent)
      return;
    const nextW = Math.max(360, parent.clientWidth);
    const nextH = Math.max(420, parent.clientHeight);
    setPos(prev => (prev.x === 0 && prev.y === 0 ? prev : { x: 0, y: 0 }));
    setShellSize(prev => (prev.w === nextW && prev.h === nextH ? prev : { w: nextW, h: nextH }));
  }, []);

  useLayoutEffect(() => {
    if (isEmbedded)
      return;
    if (!isCoverMode)
      return;
    syncCoverToParent();
  }, [isCoverMode, syncCoverToParent]);

  useEffect(() => {
    if (isEmbedded)
      return;
    if (!isCoverMode)
      return;
    const container = containerRef.current;
    const parent = container?.parentElement;
    if (!parent)
      return;
    coverObserverRef.current?.disconnect();
    const observer = new ResizeObserver(() => syncCoverToParent());
    coverObserverRef.current = observer;
    observer.observe(parent);
    return () => {
      observer.disconnect();
      if (coverObserverRef.current === observer)
        coverObserverRef.current = null;
    };
  }, [isCoverMode, syncCoverToParent]);

  const exitCoverModeToFloating = useCallback((event: { clientX: number; clientY: number }) => {
    const container = containerRef.current;
    const parent = container?.parentElement;
    if (!container || !parent) {
      setCoverMode(false);
      setShellSize(prev => ({ w: Math.min(prev.w, 860), h: 420 }));
      return;
    }
    const rect = parent.getBoundingClientRect();
    const maxW = Math.max(360, parent.clientWidth - 12);
    const maxH = Math.max(420, parent.clientHeight - 12);
    const desiredW = Math.min(960, Math.max(520, Math.round(parent.clientWidth * 0.6)));
    const desiredH = Math.min(640, Math.max(420, Math.round(parent.clientHeight * 0.56)));
    const nextW = clamp(desiredW, 360, maxW);
    const nextH = clamp(desiredH, 420, maxH);
    const hintX = event.clientX - rect.left;
    const hintY = event.clientY - rect.top;
    const nextX = clamp(Math.round(hintX - nextW * 0.5), 0, Math.max(0, parent.clientWidth - nextW));
    const nextY = clamp(Math.round(hintY - 16), 0, Math.max(0, parent.clientHeight - nextH));
    setCoverMode(false);
    setShellSize({ w: nextW, h: nextH });
    setPos({ x: nextX, y: nextY });
    return { x: nextX, y: nextY };
  }, [setCoverMode]);

  const title = useMemo(() => payload.label, [payload.label]);

  const computeDockInsertIndex = useCallback((clientY: number) => {
    const itemsRoot = document.querySelector("[data-role='material-package-tree-items']") as HTMLElement | null;
    if (!itemsRoot) {
      return 0;
    }
    const rows = Array.from(itemsRoot.querySelectorAll<HTMLElement>("[data-role='material-package-visible-row'][data-base-index]"));
    if (!rows.length) {
      return 0;
    }
    const baseCount = rows.length;
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (clientY < mid) {
        const idx = Number(row.dataset.baseIndex ?? 0);
        if (!Number.isFinite(idx))
          return 0;
        return clamp(Math.floor(idx), 0, baseCount);
      }
    }
    const last = rows[rows.length - 1]!;
    const lastIdx = Number(last.dataset.baseIndex ?? baseCount);
    const finalCount = Number.isFinite(lastIdx) ? lastIdx + 1 : baseCount;
    return clamp(finalCount, 0, finalCount);
  }, []);

  const dispatchDockHintByIndex = useCallback((clientY: number) => {
    const itemsRoot = document.querySelector("[data-role='material-package-tree-items']") as HTMLElement | null;
    const rows = itemsRoot ? Array.from(itemsRoot.querySelectorAll<HTMLElement>("[data-role='material-package-visible-row'][data-base-index]")) : [];
    const baseCount = rows.length;
    const index = computeDockInsertIndex(clientY);
    const baseText = index <= 0 ? "插入到顶部" : index >= baseCount ? "插入到底部" : "插入到这里";
    window.dispatchEvent(new CustomEvent("tc:material-package:dock-hint", { detail: { visible: true, index, text: `${baseText}（${index}/${baseCount}）` } }));
  }, [computeDockInsertIndex]);

  const clearDockHintByIndex = useCallback(() => {
    window.dispatchEvent(new CustomEvent("tc:material-package:dock-hint", { detail: { visible: false } }));
  }, []);

  const dispatchMainDropPreview = useCallback((visible: boolean) => {
    window.dispatchEvent(new CustomEvent("tc:material-package:main-drop-preview", { detail: { visible } }));
  }, []);

  const dockPointerDragRef = useRef<{ active: boolean; pointerId: number | null }>({ active: false, pointerId: null });
  const onDockedHandlePointerDown = useCallback((event: React.PointerEvent) => {
    if (!isDockedEmbedded) {
      return;
    }
    dockPointerDragRef.current.active = true;
    dockPointerDragRef.current.pointerId = event.pointerId;
    dispatchMainDropPreview(false);
    event.preventDefault();
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
    catch {
      // ignore
    }
    dispatchDockHintByIndex(event.clientY);
  }, [dispatchDockHintByIndex, isDockedEmbedded]);

  const onDockedHandlePointerMove = useCallback((event: React.PointerEvent) => {
    if (!dockPointerDragRef.current.active || dockPointerDragRef.current.pointerId !== event.pointerId) {
      return;
    }

    const dockZone = document.querySelector("[data-role='material-package-dock-zone']") as HTMLElement | null;
    const mainZone = document.querySelector("[data-role='material-package-main-zone']") as HTMLElement | null;
    const inRect = (zone: HTMLElement | null) => {
      if (!zone) {
        return false;
      }
      const rect = zone.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    };

    if (inRect(dockZone)) {
      dispatchMainDropPreview(false);
      dispatchDockHintByIndex(event.clientY);
      return;
    }

    clearDockHintByIndex();
    dispatchMainDropPreview(inRect(mainZone));
  }, [clearDockHintByIndex, dispatchDockHintByIndex, dispatchMainDropPreview]);

  const onDockedHandlePointerUp = useCallback((event: React.PointerEvent) => {
    if (!dockPointerDragRef.current.active || dockPointerDragRef.current.pointerId !== event.pointerId) {
      return;
    }
    dockPointerDragRef.current.active = false;
    dockPointerDragRef.current.pointerId = null;
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    }
    catch {
      // ignore
    }

    const dockZone = document.querySelector("[data-role='material-package-dock-zone']") as HTMLElement | null;
    const mainZone = document.querySelector("[data-role='material-package-main-zone']") as HTMLElement | null;
    const inRect = (zone: HTMLElement | null) => {
      if (!zone) {
        return false;
      }
      const rect = zone.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    };

    if (inRect(dockZone)) {
      const index = computeDockInsertIndex(event.clientY);
      window.dispatchEvent(new CustomEvent("tc:material-package:dock-move", { detail: { index } }));
      clearDockHintByIndex();
      dispatchMainDropPreview(false);
      return;
    }

    clearDockHintByIndex();
    dispatchMainDropPreview(false);
    if (inRect(mainZone)) {
      onPopout?.(payload);
    }
  }, [clearDockHintByIndex, computeDockInsertIndex, dispatchMainDropPreview, onPopout, payload]);

  const initialState = useMemo(() => resolveInitialPreviewState(payload), [payload]);
  const [folderPath, setFolderPath] = useState<string[]>(() => initialState.folderPath);
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(() => {
    if (initialState.selectedMaterialName)
      return { type: "material", name: initialState.selectedMaterialName };
    return null;
  });
  const [keyword, setKeyword] = useState("");
  const [viewMode, setViewMode] = useState<"icon" | "list">("icon");
  const [thumbSize, setThumbSize] = useState(136);
  const defaultUseBackend = !(import.meta.env.MODE === "test");
  const [useBackend] = useLocalStorage<boolean>("tc:material-package:use-backend", defaultUseBackend);
  const [selectedPackageId, setSelectedPackageId] = useState<number>(() => payload.packageId);
  const lastClickRef = useRef<{ key: string; timeMs: number } | null>(null);

  const dockZoneSelector = "[data-role='material-package-dock-zone']";
  const buildDockPayload = useCallback((): MaterialPreviewPayload => {
    const pathTokens = folderPath.map(p => `folder:${p}`);
    if (selectedItem?.type === "material")
      return { kind: "material", packageId: selectedPackageId, label: selectedItem.name, path: [...pathTokens, `material:${selectedItem.name}`] };
    if (folderPath.length)
      return { kind: "folder", packageId: selectedPackageId, label: folderPath[folderPath.length - 1]!, path: pathTokens };
    return { kind: "package", packageId: selectedPackageId, label: title, path: [] };
  }, [folderPath, selectedItem?.name, selectedItem?.type, selectedPackageId, title]);

  const dispatchDockHint = useCallback((args: { clientX: number; clientY: number }) => {
    const zone = document.querySelector(dockZoneSelector) as HTMLElement | null;
    if (!zone)
      return;
    const rect = zone.getBoundingClientRect();
    const isInside = args.clientX >= rect.left && args.clientX <= rect.right && args.clientY >= rect.top && args.clientY <= rect.bottom;
    if (!isInside) {
      window.dispatchEvent(new CustomEvent("tc:material-package:dock-hint", { detail: { visible: false } }));
      return;
    }

    const itemsRoot = document.querySelector("[data-role='material-package-tree-items']") as HTMLElement | null;
    const rows = itemsRoot ? Array.from(itemsRoot.querySelectorAll<HTMLElement>("[data-role='material-package-visible-row'][data-base-index]")) : [];
    const baseCount = rows.length;
    const index = computeDockInsertIndex(args.clientY);
    const baseText = index <= 0 ? "插入到顶部" : index >= baseCount ? "插入到底部" : "插入到这里";
    window.dispatchEvent(new CustomEvent("tc:material-package:dock-hint", { detail: { visible: true, index, text: `${baseText}（${index}/${baseCount}）` } }));
  }, [computeDockInsertIndex]);

  useEffect(() => {
    setFolderPath(initialState.folderPath);
    setSelectedItem(initialState.selectedMaterialName ? { type: "material", name: initialState.selectedMaterialName } : null);
    setKeyword("");
  }, [initialState.folderPath, initialState.selectedMaterialName]);

  useEffect(() => {
    if (payload.packageId === selectedPackageId)
      return;
    setSelectedPackageId(payload.packageId);
    setFolderPath(initialState.folderPath);
    setSelectedItem(initialState.selectedMaterialName ? { type: "material", name: initialState.selectedMaterialName } : null);
  }, [initialState.folderPath, initialState.selectedMaterialName, payload.packageId, selectedPackageId]);

  const packagesQuery = useQuery({
    queryKey: buildMaterialPackageMyQueryKey(useBackend),
    queryFn: () => useBackend ? getMyMaterialPackages() : Promise.resolve(readMockPackages()),
    staleTime: 30 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const packages = useMemo(() => {
    const data = packagesQuery.data;
    if (!Array.isArray(data))
      return [] as MaterialPackageRecord[];
    return data.filter(Boolean) as MaterialPackageRecord[];
  }, [packagesQuery.data]);

  useEffect(() => {
    if (!packages.length)
      return;
    const exists = packages.some(p => Number(p.packageId) === Number(selectedPackageId));
    if (exists)
      return;
    const firstId = Number(packages[0]!.packageId);
    if (!Number.isFinite(firstId))
      return;
    setSelectedPackageId(firstId);
    setFolderPath([]);
    setSelectedItem(null);
  }, [packages, selectedPackageId]);

  const backendPackageQuery = useQuery({
    enabled: useBackend && Number.isFinite(selectedPackageId) && selectedPackageId > 0,
    queryKey: buildMaterialPackageDetailQueryKey(selectedPackageId, useBackend),
    queryFn: () => getMaterialPackage(selectedPackageId),
    staleTime: 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const activeMockPackage = useMemo(() => {
    if (useBackend)
      return null;
    const found = packages.find(p => Number(p.packageId) === Number(selectedPackageId));
    return found ?? (packages[0] ?? null);
  }, [packages, selectedPackageId, useBackend]);

  const materialPackage = useMemo(() => {
    if (useBackend)
      return backendPackageQuery.data ?? null;
    return activeMockPackage;
  }, [activeMockPackage, backendPackageQuery.data, useBackend]);

  const rootPackageName = useMemo(() => {
    const id = Number(selectedPackageId);
    const fromList = packages.find(p => Number(p.packageId) === id)?.name ?? null;
    if (fromList && fromList.trim())
      return fromList;
    const fromDetail = materialPackage?.name ?? null;
    if (fromDetail && fromDetail.trim())
      return fromDetail;
    return `素材包#${selectedPackageId}`;
  }, [materialPackage?.name, packages, selectedPackageId]);

  const fullPathText = useMemo(() => {
    const rest = folderPath.join(" / ");
    return rest ? `${rootPackageName} / ${rest}` : rootPackageName;
  }, [folderPath, rootPackageName]);

  const content = materialPackage?.content ?? null;

  const currentNodes = useMemo(() => {
    if (!content)
      return [] as MaterialNode[];
    return getFolderNodesAtPath(content, folderPath);
  }, [content, folderPath]);

  const filteredNodes = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    const nodes = currentNodes;
    if (!normalized)
      return nodes;
    return nodes.filter((node) => {
      const name = node.type === "folder" ? node.name : node.name;
      const note = node.type === "material" ? node.note : "";
      return String(name || "").toLowerCase().includes(normalized) || String(note || "").toLowerCase().includes(normalized);
    });
  }, [currentNodes, keyword]);

  const sortedNodes = useMemo(() => {
    const folders = filteredNodes.filter(n => n.type === "folder");
    const materials = filteredNodes.filter(n => n.type === "material");
    return [...folders, ...materials];
  }, [filteredNodes]);

  const pathText = useMemo(() => {
    const pkgName = materialPackage?.name ?? `素材包#${selectedPackageId}`;
    if (!folderPath.length)
      return `${pkgName}`;
    return `${pkgName} / ${folderPath.join(" / ")}`;
  }, [folderPath, materialPackage?.name, selectedPackageId]);

  const totalCount = useMemo(() => sortedNodes.length, [sortedNodes.length]);
  const selectedCount = useMemo(() => (selectedItem ? 1 : 0), [selectedItem]);

  const listQueryKey = useMemo(() => buildMaterialPackageMyQueryKey(useBackend), [useBackend]);
  const detailQueryKey = useMemo(
    () => buildMaterialPackageDetailQueryKey(selectedPackageId, useBackend),
    [selectedPackageId, useBackend],
  );

  const compactList = useMemo(() => viewMode === "list" && shellSize.w <= 360, [shellSize.w, viewMode]);

  const iconControlClass = "h-6 w-[26px] inline-flex items-center justify-center rounded-none text-[color:var(--tc-mpf-icon)] hover:text-[color:var(--tc-mpf-icon-hover)] active:opacity-90 transition focus:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--tc-mpf-accent)]";
  const iconDangerControlClass = "h-6 w-[26px] inline-flex items-center justify-center rounded-none text-[color:var(--tc-mpf-danger)] hover:text-[color:var(--tc-mpf-danger-hover)] active:opacity-90 transition focus:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--tc-mpf-danger-ring)]";

  const saveMockRecord = useCallback((nextRecord: MaterialPackageRecord) => {
    const now = new Date().toISOString();
    const base = Array.isArray(queryClient.getQueryData(listQueryKey))
      ? (queryClient.getQueryData(listQueryKey) as MaterialPackageRecord[])
      : readMockPackages();
    const nextList = (base ?? []).map(p => Number(p.packageId) === Number(nextRecord.packageId) ? { ...nextRecord, updateTime: now } : p);
    writeMockPackages(nextList);
    queryClient.setQueryData(listQueryKey, nextList);
    queryClient.setQueryData(detailQueryKey, { ...nextRecord, updateTime: now });
  }, [detailQueryKey, listQueryKey, queryClient]);

  const saveContent = useCallback(async (nextContent: MaterialPackageContent) => {
    if (!materialPackage)
      return;
    if (useBackend) {
      const updated = await updateMaterialPackage({ packageId: selectedPackageId, content: nextContent });
      queryClient.setQueryData(detailQueryKey, updated);
      queryClient.invalidateQueries({ queryKey: listQueryKey });
      return;
    }
    saveMockRecord({ ...materialPackage, content: nextContent, updateTime: new Date().toISOString() });
  }, [detailQueryKey, listQueryKey, materialPackage, queryClient, saveMockRecord, selectedPackageId, useBackend]);

  const ensureContent = useCallback(() => {
    if (!materialPackage || !content)
      throw new Error("素材包未加载完成");
    return content;
  }, [content, materialPackage]);

  const handleCreatePackage = useCallback(async () => {
    const name = window.prompt("输入素材包名称", `素材箱 ${packages.length + 1}`);
    if (name == null)
      return;
    const trimmed = name.trim();
    if (!trimmed)
      return;

    if (useBackend) {
      const created = await createMaterialPackage({ name: trimmed, content: buildEmptyMaterialPackageContent() });
      queryClient.invalidateQueries({ queryKey: listQueryKey });
      setSelectedPackageId(created.packageId);
      setFolderPath([]);
      setSelectedItem(null);
      return;
    }

    const now = new Date().toISOString();
    const base = Array.isArray(queryClient.getQueryData(listQueryKey))
      ? (queryClient.getQueryData(listQueryKey) as MaterialPackageRecord[])
      : readMockPackages();
    const maxId = Math.max(0, ...base.map(p => Number(p.packageId) || 0));
    const nextId = maxId + 1;
    const nextRecord: MaterialPackageRecord = {
      packageId: nextId,
      userId: 0,
      name: trimmed,
      description: "",
      coverUrl: null,
      visibility: 1,
      status: 0,
      content: buildEmptyMaterialPackageContent(),
      importCount: 0,
      createTime: now,
      updateTime: now,
    };
    const nextList = [...base, nextRecord];
    writeMockPackages(nextList);
    queryClient.setQueryData(listQueryKey, nextList);
    queryClient.setQueryData(buildMaterialPackageDetailQueryKey(nextId, false), nextRecord);
    setSelectedPackageId(nextId);
    setFolderPath([]);
    setSelectedItem(null);
  }, [listQueryKey, packages.length, queryClient, useBackend]);

  const handleRenamePackage = useCallback(async () => {
    if (!materialPackage)
      return;
    const nextName = window.prompt("输入素材包新名称", materialPackage.name ?? "");
    if (nextName == null)
      return;
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === materialPackage.name)
      return;

    if (useBackend) {
      const updated = await updateMaterialPackage({ packageId: selectedPackageId, name: trimmed });
      queryClient.setQueryData(detailQueryKey, updated);
      queryClient.invalidateQueries({ queryKey: listQueryKey });
      return;
    }
    saveMockRecord({ ...materialPackage, name: trimmed });
  }, [detailQueryKey, listQueryKey, materialPackage, queryClient, saveMockRecord, selectedPackageId, useBackend]);

  const handleDeletePackage = useCallback(async () => {
    if (!materialPackage)
      return;
    const ok = window.confirm(`确认删除素材包「${materialPackage.name}」？`);
    if (!ok)
      return;

    if (useBackend) {
      await deleteMaterialPackage(selectedPackageId);
      queryClient.invalidateQueries({ queryKey: listQueryKey });
      queryClient.removeQueries({ queryKey: detailQueryKey });
      setSelectedPackageId(0);
      setFolderPath([]);
      setSelectedItem(null);
      return;
    }

    const base = Array.isArray(queryClient.getQueryData(listQueryKey))
      ? (queryClient.getQueryData(listQueryKey) as MaterialPackageRecord[])
      : readMockPackages();
    const nextList = base.filter(p => Number(p.packageId) !== Number(selectedPackageId));
    const normalized = nextList.length
      ? nextList
      : [
          {
            packageId: 1,
            userId: 0,
            name: "素材箱·空白",
            description: "",
            coverUrl: null,
            visibility: 1,
            status: 0,
            content: buildEmptyMaterialPackageContent(),
            importCount: 0,
            createTime: new Date().toISOString(),
            updateTime: new Date().toISOString(),
          } satisfies MaterialPackageRecord,
        ];
    writeMockPackages(normalized);
    queryClient.setQueryData(listQueryKey, normalized);
    setSelectedPackageId(Number(normalized[0]!.packageId));
    setFolderPath([]);
    setSelectedItem(null);
  }, [listQueryKey, materialPackage, queryClient, selectedPackageId, useBackend]);

  const handleCreateFolder = useCallback(async () => {
    const nextName = window.prompt("输入文件夹名称", "新文件夹");
    if (nextName == null)
      return;
    const trimmed = nextName.trim();
    if (!trimmed)
      return;
    setSelectedItem(null);
    const next = draftCreateFolder(ensureContent(), folderPath, trimmed);
    await saveContent(next);
  }, [ensureContent, folderPath, saveContent]);

  const handleRename = useCallback(async () => {
    if (selectedItem?.type === "material") {
      const nextName = window.prompt("输入素材新名称", selectedItem.name);
      if (nextName == null)
        return;
      const trimmed = nextName.trim();
      if (!trimmed)
        return;
      const existingNodes = getFolderNodesAtPath(ensureContent(), folderPath);
      const existingNote = (existingNodes.find(n => n.type === "material" && n.name === selectedItem.name) as any)?.note ?? "";
      const nextNote = window.prompt("输入备注（可为空）", String(existingNote ?? ""));
      if (nextNote == null)
        return;
      const next = draftRenameMaterial(ensureContent(), folderPath, selectedItem.name, trimmed, nextNote.trim());
      setSelectedItem({ type: "material", name: trimmed });
      await saveContent(next);
      return;
    }

    if (selectedItem?.type === "folder") {
      const nextName = window.prompt("输入文件夹新名称", selectedItem.name);
      if (nextName == null)
        return;
      const trimmed = nextName.trim();
      if (!trimmed)
        return;
      const next = draftRenameFolder(ensureContent(), folderPath, selectedItem.name, trimmed);
      setSelectedItem({ type: "folder", name: trimmed });
      await saveContent(next);
      return;
    }

    if (!folderPath.length) {
      await handleRenamePackage();
      return;
    }

    const currentFolderName = folderPath[folderPath.length - 1]!;
    const nextName = window.prompt("输入文件夹新名称", currentFolderName);
    if (nextName == null)
      return;
    const trimmed = nextName.trim();
    if (!trimmed)
      return;
    const parentPath = folderPath.slice(0, -1);
    const next = draftRenameFolder(ensureContent(), parentPath, currentFolderName, trimmed);
    setFolderPath(prev => {
      if (!prev.length)
        return prev;
      const copy = prev.slice();
      copy[copy.length - 1] = trimmed;
      return copy;
    });
    await saveContent(next);
  }, [ensureContent, folderPath, handleRenamePackage, saveContent, selectedItem]);

  const handleDelete = useCallback(async () => {
    if (selectedItem?.type === "material") {
      const ok = window.confirm(`确认删除素材「${selectedItem.name}」？`);
      if (!ok)
        return;
      const next = draftDeleteMaterial(ensureContent(), folderPath, selectedItem.name);
      setSelectedItem(null);
      await saveContent(next);
      return;
    }

    if (selectedItem?.type === "folder") {
      const ok = window.confirm(`确认删除文件夹「${selectedItem.name}」（包含子内容）？`);
      if (!ok)
        return;
      const next = draftDeleteFolder(ensureContent(), folderPath, selectedItem.name);
      setSelectedItem(null);
      await saveContent(next);
      return;
    }

    if (!folderPath.length) {
      await handleDeletePackage();
      return;
    }

    const currentFolderName = folderPath[folderPath.length - 1]!;
    const ok = window.confirm(`确认删除文件夹「${currentFolderName}」（包含子内容）？`);
    if (!ok)
      return;
    const parentPath = folderPath.slice(0, -1);
    const next = draftDeleteFolder(ensureContent(), parentPath, currentFolderName);
    setFolderPath(parentPath);
    setSelectedItem(null);
    await saveContent(next);
  }, [ensureContent, folderPath, handleDeletePackage, saveContent, selectedItem]);

  const importInputRef = useRef<HTMLInputElement | null>(null);
  const handleImportClick = useCallback(() => {
    const el = importInputRef.current;
    if (!el)
      return;
    el.value = "";
    el.click();
  }, []);

  const handleImportChange = useCallback(async () => {
    const el = importInputRef.current;
    if (!el)
      return;
    const files = Array.from(el.files || []);
    if (!files.length)
      return;

    let nextContent = ensureContent();
    for (const file of files) {
      const lower = file.name.toLowerCase();
      const isImage = /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(lower);
      const isAudio = /\.(mp3|wav|ogg|flac|m4a)$/i.test(lower);
      const isText = /\.(txt|md)$/i.test(lower);

      let messages: any[] = [];
      if (isImage) {
        messages = [{
          messageType: 2,
          annotations: ["图片"],
          extra: { imageMessage: { url: useBackend ? "" : URL.createObjectURL(file), fileName: file.name } },
        }];
      }
      else if (isAudio) {
        messages = [{
          messageType: 3,
          annotations: ["音频"],
          extra: { soundMessage: { url: useBackend ? "" : URL.createObjectURL(file), fileName: file.name } },
        }];
      }
      else if (isText) {
        const text = await file.text().catch(() => "");
        messages = [{
          messageType: 1,
          content: text,
          annotations: ["文本"],
          extra: {},
        }];
      }
      else {
        messages = [{
          messageType: 1,
          content: file.name,
          annotations: ["文件"],
          extra: {},
        }];
      }

      const material: MaterialItemNode = {
        type: "material",
        name: file.name,
        note: "",
        messages,
      };
      nextContent = draftCreateMaterial(nextContent, folderPath, material);
    }
    await saveContent(nextContent);
  }, [ensureContent, folderPath, saveContent, useBackend]);

  const onHeaderPointerDown = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0)
      return;
    const container = containerRef.current;
    const parent = container?.parentElement;
    if (!container || !parent)
      return;

    // 在 header 上启动 pointer capture，保证后续 move/up 都能收到
    try {
      container.setPointerCapture(event.pointerId);
    }
    catch {
      // ignore
    }

    event.preventDefault();
    pointerRef.current.pointerId = event.pointerId;
    pointerRef.current.startClientX = event.clientX;
    pointerRef.current.startClientY = event.clientY;

    const parentRect = parent.getBoundingClientRect();
    if (isCoverMode) {
      // Cover 模式：仅在“真的拖动”时退出 cover 并进入 drag
      pointerRef.current.mode = "coverPending";
      pointerRef.current.offsetX = event.clientX - parentRect.left - pos.x;
      pointerRef.current.offsetY = event.clientY - parentRect.top - pos.y;
      return;
    }

    pointerRef.current.mode = "drag";
    pointerRef.current.offsetX = event.clientX - parentRect.left - pos.x;
    pointerRef.current.offsetY = event.clientY - parentRect.top - pos.y;
  }, [isCoverMode, pos.x, pos.y]);

  const onResizePointerDown = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0)
      return;
    const container = containerRef.current;
    if (!container)
      return;

    try {
      container.setPointerCapture(event.pointerId);
    }
    catch {
      // ignore
    }

    event.preventDefault();
    if (isCoverMode) {
      // 从“覆盖模式”进入自由弹窗，但保持当前尺寸；
      // 否则按下 resize handle 会立刻触发“缩小到预设浮窗大小”，体验很突兀。
      flushSync(() => setCoverMode(false));
    }
    pointerRef.current.pointerId = event.pointerId;
    pointerRef.current.mode = "resize";
    resizeRef.current.startX = event.clientX;
    resizeRef.current.startY = event.clientY;
    const rect = containerRef.current?.getBoundingClientRect();
    resizeRef.current.startW = rect ? Math.round(rect.width) : shellSize.w;
    resizeRef.current.startH = rect ? Math.round(rect.height) : shellSize.h;
  }, [isCoverMode, setCoverMode, shellSize.h, shellSize.w]);

  const onContainerPointerMove = useCallback((event: React.PointerEvent) => {
    if (pointerRef.current.pointerId == null || event.pointerId !== pointerRef.current.pointerId)
      return;
    const container = containerRef.current;
    const parent = container?.parentElement;
    if (!container || !parent)
      return;

    const mode = pointerRef.current.mode;
    if (mode === "none")
      return;

    if (mode === "coverPending") {
      const dx = event.clientX - pointerRef.current.startClientX;
      const dy = event.clientY - pointerRef.current.startClientY;
      if (Math.abs(dx) + Math.abs(dy) < 2)
        return;
      let nextPos: { x: number; y: number } | undefined;
      flushSync(() => {
        nextPos = exitCoverModeToFloating({ clientX: event.clientX, clientY: event.clientY });
      });
      pointerRef.current.mode = "drag";
      const parentRect = parent.getBoundingClientRect();
      pointerRef.current.offsetX = pointerRef.current.startClientX - parentRect.left - (nextPos?.x ?? 0);
      pointerRef.current.offsetY = pointerRef.current.startClientY - parentRect.top - (nextPos?.y ?? 0);
      return;
    }

    if (mode === "drag") {
      const parentRect = parent.getBoundingClientRect();
      const nextX = event.clientX - parentRect.left - pointerRef.current.offsetX;
      const nextY = event.clientY - parentRect.top - pointerRef.current.offsetY;
      const maxX = parentRect.width - container.offsetWidth;
      const maxY = parentRect.height - container.offsetHeight;
      dispatchDockHint({ clientX: event.clientX, clientY: event.clientY });
      setPos({
        x: clamp(nextX, 0, Math.max(0, maxX)),
        y: clamp(nextY, 0, Math.max(0, maxY)),
      });
      return;
    }

    if (mode === "resize") {
      const maxW = parent.clientWidth - 12;
      const maxH = parent.clientHeight - 12;
      const nextW = clamp(resizeRef.current.startW + (event.clientX - resizeRef.current.startX), 360, Math.max(360, maxW));
      const nextH = clamp(resizeRef.current.startH + (event.clientY - resizeRef.current.startY), 420, Math.max(420, maxH));
      setShellSize(prev => (prev.w === nextW && prev.h === nextH ? prev : { w: nextW, h: nextH }));
    }
  }, [dispatchDockHint, exitCoverModeToFloating]);

  const onContainerPointerUp = useCallback((event: React.PointerEvent) => {
    if (pointerRef.current.pointerId == null || event.pointerId !== pointerRef.current.pointerId)
      return;
    const mode = pointerRef.current.mode;
    if (mode === "drag") {
      const zone = document.querySelector(dockZoneSelector) as HTMLElement | null;
      if (zone) {
        const rect = zone.getBoundingClientRect();
        const isInside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
        if (isInside) {
          const index = computeDockInsertIndex(event.clientY);
          onDock(buildDockPayload(), { index });
        }
      }
      window.dispatchEvent(new CustomEvent("tc:material-package:dock-hint", { detail: { visible: false } }));
    }
    try {
      containerRef.current?.releasePointerCapture(event.pointerId);
    }
    catch {
      // ignore
    }
    pointerRef.current.pointerId = null;
    pointerRef.current.mode = "none";
  }, [buildDockPayload, computeDockInsertIndex, onDock]);

  return (
    <div
      ref={containerRef}
      className={isEmbedded
        ? "tc-mpf relative flex flex-col w-full h-full rounded-md border border-[color:var(--tc-mpf-border-strong)] bg-[color:var(--tc-mpf-bg)] text-[color:var(--tc-mpf-text)] shadow-[var(--tc-mpf-shadow)] overflow-hidden"
        : "tc-mpf absolute z-[40] flex flex-col rounded-md border border-[color:var(--tc-mpf-border-strong)] bg-[color:var(--tc-mpf-bg)] text-[color:var(--tc-mpf-text)] shadow-[var(--tc-mpf-shadow)] overflow-hidden"}
      onPointerMove={isEmbedded ? undefined : onContainerPointerMove}
      onPointerUp={isEmbedded ? undefined : onContainerPointerUp}
      onPointerCancel={isEmbedded ? undefined : onContainerPointerUp}
      style={{
        left: isEmbedded ? undefined : `${pos.x}px`,
        top: isEmbedded ? undefined : `${pos.y}px`,
        width: isEmbedded ? "100%" : `${shellSize.w}px`,
        height: isEmbedded ? "100%" : `${shellSize.h}px`,
      }}
    >
      {/* Tabs bar (prototype: tabs) */}
      <div
        className={`h-[34px] flex items-stretch border-b border-[color:var(--tc-mpf-border)] bg-[color:var(--tc-mpf-surface-2)] select-none ${(!isEmbedded || isDockedEmbedded) ? "touch-none" : ""}`}
        onPointerDownCapture={(e) => {
          const target = e.target as HTMLElement | null;
          if (!target)
            return;
          if (target.closest("[data-mpf-no-drag]"))
            return;
          if (target.closest("button,[role='button'],a,input,select,textarea"))
            return;
          if (isDockedEmbedded) {
            onDockedHandlePointerDown(e);
            return;
          }
          if (!isEmbedded) {
            onHeaderPointerDown(e);
          }
        }}
        onPointerMoveCapture={isDockedEmbedded ? onDockedHandlePointerMove : undefined}
        onPointerUpCapture={isDockedEmbedded ? onDockedHandlePointerUp : undefined}
        onPointerCancelCapture={isDockedEmbedded ? onDockedHandlePointerUp : undefined}
        role="presentation"
      >
        <div
          className="flex items-stretch flex-1 min-w-0"
          title={isDockedEmbedded ? "按住任意空白处拖拽：目录内可任意插入，拖到右侧可脱离目录" : "拖动窗口"}
        >
          <div
            className="flex items-center gap-2 px-3 flex-1 min-w-0 text-[13px] font-normal text-[color:var(--tc-mpf-text)] bg-[color:var(--tc-mpf-surface)] cursor-move"
          >
            <PackageIcon className="size-4 shrink-0 opacity-80" weight="bold" />
            <PortalTooltip label={fullPathText} placement="bottom">
              <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                <button
                  type="button"
                  className="min-w-0 shrink truncate hover:underline"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setFolderPath([]);
                    setSelectedItem(null);
                  }}
                  data-mpf-no-drag="1"
                  title="回到根目录"
                >
                  {rootPackageName}
                </button>
                {folderPath.length > 0 && (
                  <span className="shrink-0 opacity-70">/</span>
                )}
                {(() => {
                  if (!folderPath.length) {
                    return null;
                  }
                  const MAX_TAIL = 3;
                  const tailStart = Math.max(0, folderPath.length - MAX_TAIL);
                  const hiddenCount = tailStart;
                  const tail = folderPath.slice(tailStart);
                  return (
                    <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-hidden">
                      {hiddenCount > 0 && (
                        <>
                          <span className="shrink-0 opacity-70">…</span>
                          <span className="shrink-0 opacity-70">/</span>
                        </>
                      )}
                      {tail.map((name, idx) => {
                        const originalIndex = tailStart + idx;
                        const targetPath = folderPath.slice(0, originalIndex + 1);
                        const isLast = idx === tail.length - 1;
                        return (
                          <React.Fragment key={`${originalIndex}:${name}`}>
                            <button
                              type="button"
                              className={isLast
                                ? "min-w-0 max-w-full overflow-hidden truncate text-left hover:underline"
                                : "shrink-0 whitespace-nowrap hover:underline"}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setFolderPath(targetPath);
                                setSelectedItem(null);
                              }}
                              data-mpf-no-drag="1"
                              title={name}
                            >
                              {name}
                            </button>
                            {!isLast && <span className="shrink-0 opacity-70">/</span>}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </PortalTooltip>
          </div>
        </div>
        <div className="flex items-center gap-2 pr-2 bg-[color:var(--tc-mpf-surface)]" data-mpf-no-drag="1">
          <button
            type="button"
            className={iconControlClass}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDock(buildDockPayload(), { placement: "top" });
            }}
            title="插入到目录顶端"
            aria-label="插入到目录顶端"
          >
            <ArrowLineUpIcon className="size-4 opacity-80" />
          </button>
          <button
            type="button"
            className={iconControlClass}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDock(buildDockPayload(), { placement: "bottom" });
            }}
            title="插入到目录底部"
            aria-label="插入到目录底部"
          >
            <ArrowLineDownIcon className="size-4 opacity-80" />
          </button>
          {!isEmbedded && (
            <button
              type="button"
              className={iconControlClass}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCoverMode(true);
                syncCoverToParent();
              }}
              title="最大化"
              aria-label="最大化"
            >
              <SquareIcon className="size-4 opacity-80" />
            </button>
          )}
          {isEmbedded && onPopout && (
            <button
              type="button"
              className={iconControlClass}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onPopout(buildDockPayload());
              }}
              title="弹出为自由浮窗"
              aria-label="弹出为自由浮窗"
            >
              <ArrowSquareOutIcon className="size-4 opacity-80" />
            </button>
          )}
          <button
            type="button"
            className={iconControlClass}
            aria-label="关闭预览"
            onClick={() => onClose()}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <XMarkICon className="size-4 opacity-80" />
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-2 px-[10px] py-[8px] border-b border-[color:var(--tc-mpf-border)] bg-[color:var(--tc-mpf-toolbar)]">
        <button
          type="button"
          className="h-6 w-[26px] inline-flex items-center justify-center rounded-none border border-[color:var(--tc-mpf-border-strong)] bg-[color:var(--tc-mpf-surface-2)] text-[color:var(--tc-mpf-text)] hover:bg-[color:var(--tc-mpf-surface-3)] active:opacity-90 transition disabled:opacity-40"
          disabled={!folderPath.length}
          onClick={() => {
            setFolderPath(prev => (prev.length ? prev.slice(0, -1) : prev));
            setSelectedItem(null);
          }}
          aria-label="返回上一级"
          title="返回上一级"
          data-mpf-no-drag="1"
        >
          <ChevronDown className="-rotate-90 size-4 opacity-80" />
        </button>

        <input
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          placeholder="搜索素材…"
          className="flex-1 min-w-0 h-6 rounded-none border border-[color:var(--tc-mpf-border-strong)] bg-[color:var(--tc-mpf-input-bg)] px-2 text-[12px] text-[color:var(--tc-mpf-text)] placeholder:text-[color:var(--tc-mpf-muted)] focus:outline-none focus:border-[color:var(--tc-mpf-accent)]"
          data-mpf-no-drag="1"
        />

        <select
          value={String(selectedPackageId)}
          onChange={(e) => {
            const id = Number(e.target.value);
            if (!Number.isFinite(id))
              return;
            setSelectedPackageId(id);
            setFolderPath([]);
            setSelectedItem(null);
          }}
          className="h-6 w-[140px] max-w-[40%] rounded-none border border-[color:var(--tc-mpf-border-strong)] bg-[color:var(--tc-mpf-input-bg)] px-2 text-[12px] text-[color:var(--tc-mpf-text)] focus:outline-none focus:border-[color:var(--tc-mpf-accent)]"
          aria-label="选择素材包"
          title="选择素材包"
          data-mpf-no-drag="1"
        >
          {packages.map(p => (
            <option key={p.packageId} value={String(p.packageId)}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Assets panel */}
      <div className="min-h-0 flex-1 overflow-auto bg-[color:var(--tc-mpf-toolbar)] border-y border-[color:var(--tc-mpf-border)]">
        <div className="p-[12px]">
          {useBackend && backendPackageQuery.isError && (
            <div className="text-xs text-error">
              {backendPackageQuery.error instanceof Error ? backendPackageQuery.error.message : "加载素材包失败"}
            </div>
          )}

          {!useBackend && packagesQuery.isLoading && (
            <div className="text-xs opacity-70">正在加载素材包…</div>
          )}

          {!useBackend && packagesQuery.isError && (
            <div className="text-xs text-error">
              {packagesQuery.error instanceof Error ? packagesQuery.error.message : "加载素材包失败"}
            </div>
          )}

          {!content && (
            <div className="text-xs opacity-60">暂无素材包内容</div>
          )}

          {content && viewMode === "icon" && (
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(96, thumbSize)}px, 1fr))`,
              }}
            >
              {sortedNodes.map((node) => {
                const isFolder = node.type === "folder";
                const name = node.name;
                const isSelected = Boolean(selectedItem && selectedItem.type === node.type && selectedItem.name === name);
                const hintText = isFolder ? "文件夹" : (node.note?.trim() ? node.note : "素材");
                const subtitle = isFolder ? `文件夹 · ${(node.children?.length ?? 0)}项` : hintText;
                const key = `${node.type}:${name}`;

                return (
                  <div
                    key={`${node.type}:${name}`}
                    className={`border transition-colors overflow-hidden cursor-pointer ${
                      isSelected
                        ? "border-[color:var(--tc-mpf-accent)] bg-[color:var(--tc-mpf-surface-2)]"
                        : "border-[color:var(--tc-mpf-border)] bg-[color:var(--tc-mpf-surface)] hover:bg-[color:var(--tc-mpf-surface-3)]"
                    }`}
                    onClick={(e) => {
                      e.preventDefault();
                      setSelectedItem({ type: node.type, name });
                      const nowMs = Date.now();
                      const prev = lastClickRef.current;
                      lastClickRef.current = { key, timeMs: nowMs };
                      if (!prev || prev.key !== key || (nowMs - prev.timeMs) > 350)
                        return;
                      lastClickRef.current = null;
                      if (isFolder) {
                        setFolderPath(prevPath => [...prevPath, name]);
                        setSelectedItem(null);
                      }
                    }}
                  >
                    <div
                      className="relative flex items-center justify-center bg-gradient-to-b from-[color:var(--tc-mpf-surface-2)] to-[color:var(--tc-mpf-surface)] border-b border-[color:var(--tc-mpf-border)]"
                      style={{ height: `${Math.max(64, Math.round(thumbSize * 0.62))}px` }}
                    >
                      <div className="absolute left-2 top-2 inline-flex items-center rounded-none border border-[color:var(--tc-mpf-border)] bg-[color:var(--tc-mpf-surface-2)] px-1.5 py-[1px] text-[11px] text-[color:var(--tc-mpf-text)] opacity-90">
                        {isFolder ? "文件夹" : "素材"}
                      </div>
                      {isFolder
                        ? <FolderIcon className="size-10 opacity-70" />
                        : <FileImageIcon className="size-10 opacity-70" />}
                    </div>
                    <div className="p-2">
                      <div className="text-[12px] font-semibold text-[color:var(--tc-mpf-text)] truncate" title={name}>{name}</div>
                      <div className="text-[11px] text-[color:var(--tc-mpf-muted)] mt-1 truncate" title={subtitle}>
                        {subtitle}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {content && viewMode === "list" && (
            <div className="border border-[color:var(--tc-mpf-border)] overflow-hidden bg-[color:var(--tc-mpf-surface)]">
              <div className={`grid ${compactList ? "grid-cols-[1fr_72px]" : "grid-cols-[1fr_180px_96px]"} gap-2 px-3 py-2 bg-[color:var(--tc-mpf-surface-2)] border-b border-[color:var(--tc-mpf-border)] text-[11px] font-semibold text-[color:var(--tc-mpf-icon)]`}>
                <div className="opacity-90">名称</div>
                {!compactList && <div className="opacity-90">备注</div>}
                <div className="text-right opacity-90">类型</div>
              </div>
              <div>
                {sortedNodes.map((node) => {
                  const isFolder = node.type === "folder";
                  const name = node.name;
                  const isSelected = Boolean(selectedItem && selectedItem.type === node.type && selectedItem.name === name);
                  const key = `${node.type}:${name}`;
                  return (
                    <div
                      key={`${node.type}:${name}`}
                      className={`grid ${compactList ? "grid-cols-[1fr_72px]" : "grid-cols-[1fr_180px_96px]"} gap-2 px-3 py-2 text-xs border-t border-[color:var(--tc-mpf-border)] cursor-pointer ${
                        isSelected ? "bg-[color:var(--tc-mpf-selected)]" : "hover:bg-[color:var(--tc-mpf-surface-3)]"
                      }`}
                      onClick={(e) => {
                        e.preventDefault();
                        setSelectedItem({ type: node.type, name });
                        const nowMs = Date.now();
                        const prev = lastClickRef.current;
                        lastClickRef.current = { key, timeMs: nowMs };
                        if (!prev || prev.key !== key || (nowMs - prev.timeMs) > 350)
                          return;
                        lastClickRef.current = null;
                        if (isFolder) {
                          setFolderPath(prevPath => [...prevPath, name]);
                          setSelectedItem(null);
                        }
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {!compactList && (
                          isFolder
                            ? <FolderIcon className="size-4 opacity-70 shrink-0" />
                            : <FileImageIcon className="size-4 opacity-70 shrink-0" />
                        )}
                        {compactList && (
                          <span className={`inline-block size-2 rounded-none border border-[color:var(--tc-mpf-dot-border)] shrink-0 ${isFolder ? "bg-[color:var(--tc-mpf-dot-folder)]" : "bg-[color:var(--tc-mpf-dot-file)]"}`} />
                        )}
                        <div className="truncate text-[color:var(--tc-mpf-text)]">{name}</div>
                      </div>
                      {!compactList && (
                        <div className="truncate text-[color:var(--tc-mpf-muted)]">{isFolder ? "" : (node.note ?? "")}</div>
                      )}
                      <div className="text-right text-[color:var(--tc-mpf-muted)]">{isFolder ? "文件夹" : "素材"}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer (prototype: size slider) */}
      <div
        className={`shrink-0 flex items-center py-2 border-t border-[color:var(--tc-mpf-border)] bg-[color:var(--tc-mpf-bg)] text-[12px] text-[color:var(--tc-mpf-muted)] ${
          isEmbedded ? "px-3" : "pl-3 pr-8"
        } ${isEmbedded ? "flex-nowrap gap-x-2" : "flex-wrap gap-x-3 gap-y-2"}`}
      >
        <div className={`flex items-center min-w-0 ${isEmbedded ? "gap-1.5" : "flex-wrap gap-2"}`}>
          <button
            type="button"
            className={iconControlClass}
            onClick={() => setViewMode("icon")}
            aria-pressed={viewMode === "icon"}
            title="图标视图"
          >
            <SquaresFourIcon className="size-4 opacity-80" />
          </button>
          <button
            type="button"
            className={iconControlClass}
            onClick={() => setViewMode("list")}
            aria-pressed={viewMode === "list"}
            title="列表视图"
          >
            <ListBulletsIcon className="size-4 opacity-80" />
          </button>
          <div className="w-px h-4 bg-[color:var(--tc-mpf-border)] opacity-80" />
          <input
            type="range"
            min={96}
            max={180}
            value={thumbSize}
            onChange={(e) => setThumbSize(Number(e.target.value))}
            className={isEmbedded ? "min-w-[88px] w-28 max-w-[120px] shrink tc-min-range" : "min-w-[140px] w-52 max-w-[42vw] tc-min-range"}
          />
        </div>
        <div className={`flex items-center ml-auto justify-end ${isEmbedded ? "flex-nowrap gap-1.5" : "flex-wrap gap-2"}`}>
          <button type="button" className={iconControlClass} onClick={handleCreatePackage} title="新增素材包">
            <PlusIcon className="size-4 opacity-80" />
          </button>
          <button type="button" className={iconControlClass} onClick={handleCreateFolder} title="新建文件夹">
            <FolderPlusIcon className="size-4 opacity-80" />
          </button>
          <button type="button" className={iconControlClass} onClick={handleImportClick} title="导入素材">
            <UploadSimpleIcon className="size-4 opacity-80" />
          </button>
          <button
            type="button"
            className={iconControlClass}
            onClick={handleDelete}
            title="删除（按优先级）"
            aria-label="删除"
          >
            <TrashIcon className="size-4 opacity-90" />
          </button>
          <button
            type="button"
            className={iconControlClass}
            onClick={handleRename}
            title="重命名（按优先级）"
            aria-label="重命名"
          >
            <PencilSimpleIcon className="size-4 opacity-80" />
          </button>
        </div>
      </div>

      <input
        ref={importInputRef}
        type="file"
        multiple
        accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,.mp3,.wav,.ogg,.flac,.m4a,.txt,.md"
        className="hidden"
        onChange={handleImportChange}
      />

      {!isEmbedded && (
        <div
          className="absolute !right-0 !bottom-0 !left-auto !top-auto size-5 cursor-nwse-resize select-none"
          onPointerDown={onResizePointerDown}
          title="拖拽调整大小"
          role="presentation"
          style={{ touchAction: "none" }}
        >
          <svg
            className="pointer-events-none absolute !right-[2px] !bottom-[2px] opacity-80"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            style={{ width: 16, height: 16 }}
          >
            <path d="M9 15 L15 9" stroke="var(--tc-mpf-grip)" strokeWidth="1.2" strokeLinecap="square" />
            <path d="M11 15 L15 11" stroke="var(--tc-mpf-grip)" strokeWidth="1.2" strokeLinecap="square" />
            <path d="M13 15 L15 13" stroke="var(--tc-mpf-grip)" strokeWidth="1.2" strokeLinecap="square" />
          </svg>
        </div>
      )}
    </div>
  );
}
