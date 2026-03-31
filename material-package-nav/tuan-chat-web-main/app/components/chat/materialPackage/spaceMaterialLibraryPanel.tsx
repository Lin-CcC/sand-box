import type { MaterialItemNode, MaterialPackageContent, MaterialPackageRecord, SpaceMaterialPackageRecord } from "@/components/materialPackage/materialPackageApi";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import ConfirmModal from "@/components/common/comfirmModel";
import { useLocalStorage } from "@/components/common/customHooks/useLocalStorage";
import PortalTooltip from "@/components/common/portalTooltip";
import { buildEmptyMaterialPackageContent } from "@/components/chat/materialPackage/materialPackageDraft";
import { setMaterialPreviewDragData, setMaterialPreviewDragOrigin } from "@/components/chat/materialPackage/materialPackageDnd";
import MaterialPackageSquareView from "@/components/chat/materialPackage/materialPackageSquareView";
import { autoRenameVsCodeLike } from "@/components/chat/materialPackage/materialPackageExplorerOps";
import { draftCreateFolder, draftCreateMaterial } from "@/components/chat/materialPackage/materialPackageDraft";
import { getFolderNodesAtPath } from "@/components/chat/materialPackage/materialPackageTree";
import { AddIcon, ChevronDown, FolderIcon } from "@/icons";
import { readMockPackages as readMyMockPackages } from "@/components/chat/materialPackage/materialPackageMockStore";
import { ArrowClockwise, CrosshairSimple, DownloadSimple, FileImageIcon, FilePlus, FolderPlus, PackageIcon, Plus, TrashIcon, UploadSimple } from "@phosphor-icons/react";
import {
  createSpaceMaterialPackage,
  deleteSpaceMaterialPackage,
  getMyMaterialPackages,
  getSpaceMaterialPackage,
  importMaterialPackageToSpace,
  listSpaceMaterialPackages,
  updateSpaceMaterialPackage,
} from "@/components/materialPackage/materialPackageApi";

type SpaceMaterialLibraryPanelProps = {
  spaceId: number;
  spaceName?: string;
  canEdit: boolean;
};

function isValidId(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function buildListQueryKey(spaceId: number, useBackend: boolean) {
  return ["spaceMaterialPackages", spaceId, useBackend] as const;
}

function buildDetailQueryKey(spacePackageId: number, useBackend: boolean) {
  return ["spaceMaterialPackage", spacePackageId, useBackend] as const;
}

function buildMyPackagesQueryKey(useBackend: boolean) {
  return ["myMaterialPackages", useBackend] as const;
}

type SpaceMaterialMockState = Record<string, SpaceMaterialPackageRecord[]>;

function nowIso() {
  return new Date().toISOString();
}

function readMockPackages(spaceId: number): SpaceMaterialPackageRecord[] {
  try {
    const raw = localStorage.getItem("tc:space-material-packages:mock");
    const parsed = raw ? JSON.parse(raw) as SpaceMaterialMockState : {};
    const list = parsed?.[String(spaceId)];
    return Array.isArray(list) ? list : [];
  }
  catch {
    return [];
  }
}

function writeMockPackages(spaceId: number, next: SpaceMaterialPackageRecord[]) {
  try {
    const raw = localStorage.getItem("tc:space-material-packages:mock");
    const parsed = raw ? JSON.parse(raw) as SpaceMaterialMockState : {};
    const base: SpaceMaterialMockState = (parsed && typeof parsed === "object") ? parsed : {};
    base[String(spaceId)] = next;
    localStorage.setItem("tc:space-material-packages:mock", JSON.stringify(base));
  }
  catch {
    // ignore
  }
}

function makeFolderToken(name: string) {
  return `folder:${name}`;
}

function makeMaterialToken(name: string) {
  return `material:${name}`;
}

function normalizeNodes(nodes: any[]): any[] {
  return Array.isArray(nodes) ? nodes.filter(Boolean) : [];
}

function SpaceMaterialTree({
  record,
  useBackend,
  isExpanded,
  onToggleExpanded,
  selectedKey,
  onSelectNode,
  onRenamePackage,
}: {
  record: SpaceMaterialPackageRecord;
  useBackend: boolean;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  selectedKey: string | null;
  onSelectNode: (args: { kind: "package" | "folder" | "material"; key: string; packageId: number }) => void;
  onRenamePackage: (record: SpaceMaterialPackageRecord) => void;
}) {
  const spacePackageId = Number(record.spacePackageId);
  const query = useQuery({
    enabled: isExpanded && isValidId(spacePackageId) && useBackend,
    queryKey: buildDetailQueryKey(spacePackageId, useBackend),
    queryFn: () => getSpaceMaterialPackage(spacePackageId),
    staleTime: 30 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const content: MaterialPackageContent = useBackend
    ? ((query.data?.content ?? record.content) as MaterialPackageContent)
    : (record.content as MaterialPackageContent);
  const root = normalizeNodes((content as any)?.root);
  const nodeCount = Array.isArray((content as any)?.root) ? (content as any).root.length : 0;
  const [collapsedFolderKey, setCollapsedFolderKey] = useState<Record<string, boolean>>({});

  const renderNodes = (nodes: any[], folderPath: string[], depth: number) => {
    return nodes.map((node, index) => {
      if (!node || typeof node !== "object")
        return null;
      const key = `${depth}:${index}:${node.type}:${node.name}`;
      if (node.type === "folder") {
        const children = normalizeNodes(node.children);
        const nextPath = [...folderPath, node.name];
        const payloadPath = [...folderPath.map(makeFolderToken), makeFolderToken(node.name)];
        const nodeKey = `folder:${spacePackageId}:${payloadPath.join("/")}`;
        const isCollapsed = Boolean(collapsedFolderKey[nodeKey]);
        return (
          <div key={key}>
            <div
              className={`px-1 rounded-md`}
              data-node-key={nodeKey}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "copy";
                setMaterialPreviewDragData(e.dataTransfer, {
                  scope: "space",
                  kind: "folder",
                  packageId: spacePackageId,
                  label: node.name,
                  path: payloadPath,
                });
                setMaterialPreviewDragOrigin(e.dataTransfer, "tree");
              }}
              onClick={() => {
                onSelectNode({ kind: "folder", key: nodeKey, packageId: spacePackageId });
              }}
            >
              <div
                className={`flex items-center gap-1 py-1 pr-1 text-xs font-medium opacity-85 select-none rounded-md ${selectedKey === nodeKey ? "bg-base-300/60 ring-1 ring-info/20" : "hover:bg-base-300/40"}`}
                style={{ paddingLeft: 4 + depth * 14 }}
              >
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCollapsedFolderKey(prev => ({ ...prev, [nodeKey]: !Boolean(prev[nodeKey]) }));
                  }}
                  title={isCollapsed ? "展开" : "折叠"}
                >
                  <ChevronDown className={`size-4 opacity-80 ${isCollapsed ? "-rotate-90" : ""}`} />
                </button>
                <FolderIcon className="size-4 opacity-70" />
                <span className="truncate">{node.name}</span>
              </div>
            </div>
            {!isCollapsed && renderNodes(children, nextPath, depth + 1)}
          </div>
        );
      }

      if (node.type === "material") {
        const payloadPath = [
          ...folderPath.map(makeFolderToken),
          makeMaterialToken(String(node.name ?? "")),
        ];
        const nodeKey = `material:${spacePackageId}:${payloadPath.join("/")}`;
        return (
          <div
            key={key}
            className={`flex items-center gap-2 py-1 pr-2 text-xs opacity-85 select-none rounded-md ${selectedKey === nodeKey ? "bg-base-300/60 ring-1 ring-info/20" : "hover:bg-base-300/40"}`}
            style={{ paddingLeft: 22 + depth * 14 }}
            data-node-key={nodeKey}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "copy";
              setMaterialPreviewDragData(e.dataTransfer, {
                scope: "space",
                kind: "material",
                packageId: spacePackageId,
                label: node.name,
                path: payloadPath,
              });
              setMaterialPreviewDragOrigin(e.dataTransfer, "tree");
            }}
            onClick={() => {
              onSelectNode({ kind: "material", key: nodeKey, packageId: spacePackageId });
            }}
          >
            <FileImageIcon className="size-4 opacity-70" />
            <span className="truncate">{node.name}</span>
          </div>
        );
      }

      return null;
    });
  };

  return (
    <div className="px-1 rounded-md" data-node-key={`root:${spacePackageId}`}>
      <div
        className={`flex items-center gap-2 py-1 pr-1 text-xs font-medium opacity-85 select-none rounded-md ${selectedKey === `root:${spacePackageId}` ? "bg-base-300/60 ring-1 ring-info/20" : "hover:bg-base-300/40"}`}
        onClick={() => {
          onSelectNode({ kind: "package", key: `root:${spacePackageId}`, packageId: spacePackageId });
          onToggleExpanded();
        }}
      >
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleExpanded();
          }}
          title={isExpanded ? "折叠" : "展开"}
        >
          <ChevronDown className={`size-4 opacity-80 ${isExpanded ? "" : "-rotate-90"}`} />
        </button>
        <div
          className={`flex-1 min-w-0 truncate ${selectedKey === `root:${spacePackageId}` ? "text-base-content" : ""}`}
        >
          <span className="inline-flex items-center gap-1">
            <PackageIcon className="size-4 opacity-70" />
            <span
              className="truncate"
              title="双击重命名"
              onDoubleClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRenamePackage(record);
              }}
            >
              {record.name}
            </span>
          </span>
        </div>
        <PortalTooltip label={nodeCount ? `${nodeCount}项` : "空"} placement="right">
          <span className="text-[11px] opacity-50 px-1">{nodeCount ? `${nodeCount}项` : "空"}</span>
        </PortalTooltip>
      </div>

      {isExpanded && (
        <div className="pl-6 pr-1 pb-1">
          {useBackend && query.isLoading && (
            <div className="px-2 py-1 text-xs text-base-content/60">加载中…</div>
          )}
          {renderNodes(root, [], 0)}
        </div>
      )}
    </div>
  );
}

export function SpaceMaterialLibraryCategory({ spaceId, spaceName, canEdit }: SpaceMaterialLibraryPanelProps) {
  const queryClient = useQueryClient();

  const defaultUseBackend = !(import.meta.env.MODE === "test");
  const [useBackend, setUseBackend] = useLocalStorage<boolean>("tc:material-package:use-backend", defaultUseBackend);
  const [collapsedBySpace, setCollapsedBySpace] = useLocalStorage<Record<string, boolean>>("tc:space-material-library:collapsed", {});
  const [toolbarPinnedBySpace, setToolbarPinnedBySpace] = useLocalStorage<Record<string, boolean>>("tc:space-material-library:toolbar-pinned", {});
  const isCollapsed = Boolean(collapsedBySpace[String(spaceId)]);
  const toolbarPinned = Boolean(toolbarPinnedBySpace[String(spaceId)]);
  const toggleCollapsed = useCallback(() => {
    setCollapsedBySpace(prev => ({ ...prev, [String(spaceId)]: !Boolean(prev[String(spaceId)]) }));
  }, [setCollapsedBySpace, spaceId]);
  const toggleToolbarPinned = useCallback(() => {
    setToolbarPinnedBySpace(prev => ({ ...prev, [String(spaceId)]: !Boolean(prev[String(spaceId)]) }));
  }, [setToolbarPinnedBySpace, spaceId]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as any;
      const next = Boolean(detail?.useBackend);
      setUseBackend(next);
    };
    window.addEventListener("tc:material-package:use-backend-changed", handler as EventListener);
    return () => window.removeEventListener("tc:material-package:use-backend-changed", handler as EventListener);
  }, [setUseBackend]);

  const listQuery = useQuery({
    queryKey: buildListQueryKey(spaceId, useBackend),
    queryFn: async () => {
      if (!useBackend)
        return readMockPackages(spaceId);
      return await listSpaceMaterialPackages(spaceId);
    },
    staleTime: 30 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const packages = useMemo(() => Array.isArray(listQuery.data) ? listQuery.data : [], [listQuery.data]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isImportFromMyOpen, setIsImportFromMyOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [selectedNode, setSelectedNode] = useState<{ kind: "package" | "folder" | "material"; key: string; packageId: number } | null>(null);
  const [myImportKeyword, setMyImportKeyword] = useState("");
  const [selectedMyPackageId, setSelectedMyPackageId] = useState<number | null>(null);
  const [isMyImporting, setIsMyImporting] = useState(false);

  const activePackageId = useMemo(() => {
    if (selectedNode?.packageId)
      return selectedNode.packageId;
    if (expandedId)
      return expandedId;
    return null;
  }, [expandedId, selectedNode?.packageId]);

  const closeDeleteConfirm = () => {
    setIsDeleteConfirmOpen(false);
    setPendingDeleteId(null);
  };

  const myPackagesQuery = useQuery({
    enabled: isImportFromMyOpen,
    queryKey: buildMyPackagesQueryKey(useBackend),
    queryFn: () => useBackend ? getMyMaterialPackages() : Promise.resolve(readMyMockPackages()),
    staleTime: 30 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const myPackages = useMemo(() => Array.isArray(myPackagesQuery.data) ? myPackagesQuery.data as MaterialPackageRecord[] : [], [myPackagesQuery.data]);
  const filteredMyPackages = useMemo(() => {
    const q = myImportKeyword.trim().toLowerCase();
    if (!q)
      return myPackages;
    return myPackages.filter((pkg) => {
      const name = String(pkg?.name ?? "").trim().toLowerCase();
      const desc = String(pkg?.description ?? "").trim().toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  }, [myImportKeyword, myPackages]);

  const selectedMyPackage = useMemo(() => {
    if (!isValidId(selectedMyPackageId))
      return null;
    return myPackages.find(p => Number(p.packageId) === selectedMyPackageId) ?? null;
  }, [myPackages, selectedMyPackageId]);

  const loadPackageContent = useCallback(async (spacePackageId: number) => {
    if (!useBackend) {
      const found = readMockPackages(spaceId).find(p => p.spacePackageId === spacePackageId);
      return (found?.content ?? buildEmptyMaterialPackageContent()) as MaterialPackageContent;
    }
    const detail = await getSpaceMaterialPackage(spacePackageId);
    return (detail?.content ?? buildEmptyMaterialPackageContent()) as MaterialPackageContent;
  }, [spaceId, useBackend]);

  const savePackageContent = useCallback(async (spacePackageId: number, nextContent: MaterialPackageContent) => {
    if (!useBackend) {
      const base = readMockPackages(spaceId);
      writeMockPackages(
        spaceId,
        base.map(p => p.spacePackageId === spacePackageId ? { ...p, content: nextContent, updateTime: nowIso() } : p),
      );
      await queryClient.invalidateQueries({ queryKey: buildListQueryKey(spaceId, useBackend) });
      return;
    }
    await updateSpaceMaterialPackage({ spacePackageId, content: nextContent });
    await queryClient.invalidateQueries({ queryKey: buildListQueryKey(spaceId, useBackend) });
    await queryClient.invalidateQueries({ queryKey: buildDetailQueryKey(spacePackageId, useBackend) });
  }, [queryClient, spaceId, useBackend]);

  const closeImportFromMy = useCallback(() => {
    setIsImportFromMyOpen(false);
    setMyImportKeyword("");
    setSelectedMyPackageId(null);
    setIsMyImporting(false);
  }, []);

  const runImportFromMy = useCallback(async () => {
    if (!isValidId(selectedMyPackageId)) {
      toast.error("请先选择一个素材箱");
      return;
    }

    if (!useBackend) {
      const pkg = readMyMockPackages().find(p => Number(p.packageId) === selectedMyPackageId) ?? null;
      if (!pkg) {
        toast.error("素材箱不存在或已被刷新");
        return;
      }
      const base = readMockPackages(spaceId);
      const nextId = Math.max(0, ...base.map(p => Number(p.spacePackageId))) + 1;
      const now = nowIso();
      const next: SpaceMaterialPackageRecord = {
        spacePackageId: nextId,
        spaceId,
        name: pkg.name ?? `素材箱#${selectedMyPackageId}`,
        description: pkg.description ?? "",
        coverUrl: pkg.coverUrl ?? "",
        status: 0,
        content: (pkg.content ?? buildEmptyMaterialPackageContent()) as MaterialPackageContent,
        createTime: now,
        updateTime: now,
      };
      writeMockPackages(spaceId, [next, ...base]);
      await queryClient.invalidateQueries({ queryKey: buildListQueryKey(spaceId, useBackend) });
      toast.success("mock：已导入到局内素材库");
      setExpandedId(next.spacePackageId);
      closeImportFromMy();
      return;
    }

    setIsMyImporting(true);
    try {
      const result = await importMaterialPackageToSpace(selectedMyPackageId, { spaceId });
      await queryClient.invalidateQueries({ queryKey: buildListQueryKey(spaceId, useBackend) });
      toast.success("已导入到局内素材库");
      const maybeId = (result as any)?.spacePackageId;
      if (typeof maybeId === "number" && Number.isFinite(maybeId) && maybeId > 0) {
        setExpandedId(maybeId);
      }
      closeImportFromMy();
    }
    catch (error) {
      const message = error instanceof Error ? error.message : "导入失败";
      toast.error(message);
      setIsMyImporting(false);
    }
  }, [closeImportFromMy, queryClient, selectedMyPackageId, spaceId, useBackend]);

  const handleCreate = useCallback(async () => {
    const name = "新素材箱";
    if (!useBackend) {
      const base = readMockPackages(spaceId);
      const nextId = Math.max(0, ...base.map(p => p.spacePackageId)) + 1;
      const next: SpaceMaterialPackageRecord = {
        spacePackageId: nextId,
        spaceId,
        name,
        description: "",
        coverUrl: "",
        status: 0,
        content: buildEmptyMaterialPackageContent(),
        createTime: nowIso(),
        updateTime: nowIso(),
      };
      writeMockPackages(spaceId, [next, ...base]);
      await queryClient.invalidateQueries({ queryKey: buildListQueryKey(spaceId, useBackend) });
      toast.success("mock：已创建局内素材箱");
      return;
    }

    const toastId = "space-material-create";
    toast.loading("正在创建局内素材箱…", { id: toastId });
    try {
      const created = await createSpaceMaterialPackage({
        spaceId,
        name,
        description: "",
        coverUrl: "",
        content: buildEmptyMaterialPackageContent(),
      });
      toast.success("已创建局内素材箱", { id: toastId });
      setExpandedId(created?.spacePackageId ?? null);
      await queryClient.invalidateQueries({ queryKey: buildListQueryKey(spaceId, useBackend) });
    }
    catch (error) {
      const message = error instanceof Error ? error.message : "创建失败";
      toast.error(message, { id: toastId });
    }
  }, [queryClient, spaceId, useBackend]);

  const handleToolbarNewFile = useCallback(async () => {
    const targetPackageId = activePackageId;
    if (!isValidId(targetPackageId)) {
      window.alert("请先展开或选中一个局内素材箱。");
      return;
    }

    const baseContent = await loadPackageContent(targetPackageId);
    const nodes = getFolderNodesAtPath(baseContent, []);
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
    const nextContent = draftCreateMaterial(baseContent, [], material);
    await savePackageContent(targetPackageId, nextContent);

    const nodeKey = `material:${targetPackageId}:material:${finalName}`;
    setSelectedNode({ kind: "material", key: nodeKey, packageId: targetPackageId });
    setExpandedId(targetPackageId);
    toast.success("已新建文件");
    setTimeout(() => {
      document.querySelector(`[data-node-key="${nodeKey}"]`)?.scrollIntoView({ block: "nearest" });
    }, 0);
  }, [activePackageId, loadPackageContent, savePackageContent]);

  const handleToolbarNewFolder = useCallback(async () => {
    const targetPackageId = activePackageId;
    if (!isValidId(targetPackageId)) {
      window.alert("请先展开或选中一个局内素材箱。");
      return;
    }

    const baseContent = await loadPackageContent(targetPackageId);
    const nodes = getFolderNodesAtPath(baseContent, []);
    const usedNames = nodes.map(n => n.name);

    const name = window.prompt("新建文件夹名称", "新建文件夹");
    const trimmed = (name ?? "").trim();
    if (!trimmed)
      return;
    const finalName = autoRenameVsCodeLike(trimmed, usedNames);
    if (finalName !== trimmed) {
      window.alert(`名称已存在，已自动重命名为「${finalName}」。`);
    }

    const nextContent = draftCreateFolder(baseContent, [], finalName);
    await savePackageContent(targetPackageId, nextContent);

    const nodeKey = `folder:${targetPackageId}:folder:${finalName}`;
    setSelectedNode({ kind: "folder", key: nodeKey, packageId: targetPackageId });
    setExpandedId(targetPackageId);
    toast.success("已新建文件夹");
    setTimeout(() => {
      document.querySelector(`[data-node-key="${nodeKey}"]`)?.scrollIntoView({ block: "nearest" });
    }, 0);
  }, [activePackageId, loadPackageContent, savePackageContent]);

  const handleToolbarDelete = useCallback(() => {
    if (selectedNode?.kind !== "package" || !isValidId(selectedNode.packageId)) {
      window.alert("请先选中一个局内素材箱再删除。");
      return;
    }
    setPendingDeleteId(selectedNode.packageId);
    setIsDeleteConfirmOpen(true);
  }, [selectedNode]);

  const handleToolbarReveal = useCallback(() => {
    if (!selectedNode?.key)
      return;
    setExpandedId(selectedNode.packageId);
    setTimeout(() => {
      document.querySelector(`[data-node-key="${selectedNode.key}"]`)?.scrollIntoView({ block: "nearest" });
    }, 0);
  }, [selectedNode]);

  const handleDelete = useCallback(async () => {
    const id = pendingDeleteId;
    if (!isValidId(id))
      return;
    closeDeleteConfirm();

    if (!useBackend) {
      const base = readMockPackages(spaceId);
      writeMockPackages(spaceId, base.filter(p => p.spacePackageId !== id));
      await queryClient.invalidateQueries({ queryKey: buildListQueryKey(spaceId, useBackend) });
      toast.success("mock：已删除");
      return;
    }

    const toastId = `space-material-delete:${id}`;
    toast.loading("正在删除…", { id: toastId });
    try {
      await deleteSpaceMaterialPackage(id);
      toast.success("已删除", { id: toastId });
      await queryClient.invalidateQueries({ queryKey: buildListQueryKey(spaceId, useBackend) });
    }
    catch (error) {
      const message = error instanceof Error ? error.message : "删除失败";
      toast.error(message, { id: toastId });
    }
  }, [pendingDeleteId, queryClient, spaceId, useBackend]);

  const handleRename = useCallback(async (record: SpaceMaterialPackageRecord) => {
    const nextName = window.prompt("重命名局内素材箱", record.name) ?? "";
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === record.name)
      return;

    if (!useBackend) {
      const base = readMockPackages(spaceId);
      writeMockPackages(spaceId, base.map(p => p.spacePackageId === record.spacePackageId ? { ...p, name: trimmed, updateTime: nowIso() } : p));
      await queryClient.invalidateQueries({ queryKey: buildListQueryKey(spaceId, useBackend) });
      return;
    }

    const toastId = `space-material-rename:${record.spacePackageId}`;
    toast.loading("正在重命名…", { id: toastId });
    try {
      await updateSpaceMaterialPackage({ spacePackageId: record.spacePackageId, name: trimmed });
      toast.success("已重命名", { id: toastId });
      await queryClient.invalidateQueries({ queryKey: buildListQueryKey(spaceId, useBackend) });
      await queryClient.invalidateQueries({ queryKey: buildDetailQueryKey(record.spacePackageId, useBackend) });
    }
    catch (error) {
      const message = error instanceof Error ? error.message : "重命名失败";
      toast.error(message, { id: toastId });
    }
  }, [queryClient, spaceId, useBackend]);

  return (
    <div className="px-1 py-1 relative">
      <div className="flex items-center justify-between gap-2 px-2 py-1 text-xs font-medium opacity-80 select-none rounded-lg hover:bg-base-300/40 group">
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={toggleCollapsed}
          title={isCollapsed ? "展开" : "折叠"}
          aria-label={isCollapsed ? "展开局内素材库" : "折叠局内素材库"}
        >
          <ChevronDown className={`size-4 opacity-80 ${isCollapsed ? "-rotate-90" : ""}`} />
        </button>

        <span className="flex-1 truncate">局内素材库</span>

        {canEdit && (
          <div className="flex items-center gap-1">
            <div
              className="flex items-center gap-1 group/ops"
              onClick={(e) => {
                // 避免点按钮区域时触发 Header 的拖拽/选择逻辑
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <div className={`${toolbarPinned ? "flex" : "hidden group-hover/ops:flex"} items-center gap-1 opacity-90`}>
                <PortalTooltip label="新建文件" placement="bottom">
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs btn-square"
                    disabled={!isValidId(activePackageId)}
                    onClick={() => { void handleToolbarNewFile(); }}
                    aria-label="新建文件"
                  >
                    <FilePlus className="size-4" />
                  </button>
                </PortalTooltip>
                <PortalTooltip label="新建文件夹" placement="bottom">
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs btn-square"
                    disabled={!isValidId(activePackageId)}
                    onClick={() => { void handleToolbarNewFolder(); }}
                    aria-label="新建文件夹"
                  >
                    <FolderPlus className="size-4" />
                  </button>
                </PortalTooltip>
                <PortalTooltip label="新建素材箱" placement="bottom">
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs btn-square"
                    onClick={() => { void handleCreate(); }}
                    aria-label="新建素材箱"
                  >
                    <Plus className="size-4" />
                  </button>
                </PortalTooltip>
                <PortalTooltip label="导入素材包" placement="bottom">
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs btn-square"
                    onClick={() => { setIsImportOpen(true); }}
                    aria-label="导入素材包"
                  >
                    <UploadSimple className="size-4" />
                  </button>
                </PortalTooltip>
                <PortalTooltip label="从我的素材包导入素材箱" placement="bottom">
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs btn-square"
                    onClick={() => { setIsImportFromMyOpen(true); }}
                    aria-label="从我的素材包导入"
                  >
                    <DownloadSimple className="size-4" />
                  </button>
                </PortalTooltip>
                <PortalTooltip label="刷新" placement="bottom">
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs btn-square"
                    onClick={() => { void listQuery.refetch(); }}
                    aria-label="刷新"
                  >
                    <ArrowClockwise className="size-4" />
                  </button>
                </PortalTooltip>
                <PortalTooltip label={selectedNode?.kind === "package" ? "删除素材箱" : "先选中素材箱再删除"} placement="bottom">
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs btn-square"
                    disabled={selectedNode?.kind !== "package"}
                    onClick={handleToolbarDelete}
                    aria-label="删除"
                  >
                    <TrashIcon className="size-4" />
                  </button>
                </PortalTooltip>
                <PortalTooltip label={selectedNode ? "展开到选中项" : "先选择一个节点"} placement="bottom">
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs btn-square"
                    disabled={!selectedNode}
                    onClick={handleToolbarReveal}
                    aria-label="展开到选中项"
                  >
                    <CrosshairSimple className="size-4" />
                  </button>
                </PortalTooltip>
              </div>

              <PortalTooltip label={toolbarPinned ? "隐藏工具栏（仍可悬浮显示）" : "显示工具栏"} placement="bottom">
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={toggleToolbarPinned}
                  aria-label="显示/隐藏工具栏"
                  aria-pressed={toolbarPinned}
                  title={toolbarPinned ? "隐藏工具栏（仍可悬浮显示）" : "显示工具栏"}
                >
                  <span className={`inline-flex transition-transform duration-150 ${toolbarPinned ? "rotate-[135deg]" : "group-hover/ops:rotate-[135deg]"}`}>
                    <AddIcon />
                  </span>
                </button>
              </PortalTooltip>
            </div>
          </div>
        )}
      </div>

      {!isCollapsed && (
        <div className="px-1 py-1 relative mx-2 mt-1 mb-1">
          {listQuery.isLoading && (
            <div className="px-2 py-2 text-xs text-base-content/60">加载中…</div>
          )}

          {!listQuery.isLoading && packages.length === 0 && (
            <div className="px-2 py-2 text-xs text-base-content/60">
              暂无局内素材箱，点击右上角导入或新建。
            </div>
          )}

          {packages.map((pkg) => {
            const id = Number(pkg.spacePackageId);
            const isExpanded = expandedId === id;
            return (
              <div key={id} className="relative group">
                <SpaceMaterialTree
                  record={pkg}
                  useBackend={useBackend}
                  isExpanded={isExpanded}
                  onToggleExpanded={() => setExpandedId(isExpanded ? null : id)}
                  selectedKey={selectedNode?.key ?? null}
                  onSelectNode={(args) => {
                    setSelectedNode(args);
                  }}
                  onRenamePackage={(record) => {
                    void handleRename(record);
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      {isImportOpen && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 px-4" onMouseDown={() => setIsImportOpen(false)}>
          <div
            className="w-full max-w-6xl h-[80vh] rounded-xl border border-base-300 bg-base-100 shadow-xl overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <MaterialPackageSquareView
              activeSpaceId={spaceId}
              spaces={[{ spaceId, name: spaceName ?? `Space #${spaceId}` }]}
              forcedImportSpaceId={spaceId}
              onImportedToSpace={() => {
                setIsImportOpen(false);
                void queryClient.invalidateQueries({ queryKey: buildListQueryKey(spaceId, useBackend) });
              }}
            />
          </div>
        </div>
      )}

      {isImportFromMyOpen && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 px-4" onMouseDown={closeImportFromMy}>
          <div
            className="w-full max-w-5xl h-[70vh] rounded-xl border border-base-300 bg-base-100 shadow-xl overflow-hidden flex flex-col"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-base-300 px-4 py-3">
              <div className="text-sm font-semibold">从我的素材包导入素材箱</div>
              <button type="button" className="btn btn-ghost btn-xs btn-square" aria-label="关闭" onClick={closeImportFromMy}>✕</button>
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2">
              <div className="border-b md:border-b-0 md:border-r border-base-300 min-h-0 flex flex-col">
                <div className="p-3">
                  <input
                    className="input input-bordered input-sm w-full"
                    placeholder="搜索素材箱…"
                    value={myImportKeyword}
                    onChange={(e) => setMyImportKeyword(e.target.value)}
                  />
                </div>
                <div className="flex-1 min-h-0 overflow-auto px-2 pb-3">
                  {myPackagesQuery.isLoading && (
                    <div className="px-2 py-2 text-xs opacity-60">加载中…</div>
                  )}
                  {!myPackagesQuery.isLoading && filteredMyPackages.length === 0 && (
                    <div className="px-2 py-2 text-xs opacity-60">暂无可导入的素材箱</div>
                  )}
                  {filteredMyPackages.map((pkg) => {
                    const id = Number((pkg as any)?.packageId);
                    const isSelected = selectedMyPackageId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`w-full text-left px-2 py-2 rounded-md text-sm ${isSelected ? "bg-base-300/60 ring-1 ring-info/20" : "hover:bg-base-300/40"}`}
                        onClick={() => setSelectedMyPackageId(id)}
                      >
                        <div className="flex items-center gap-2">
                          <PackageIcon className="size-4 opacity-70" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{pkg?.name ?? `素材箱#${id}`}</div>
                            <div className="text-xs opacity-60 truncate">{pkg?.description ?? ""}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="min-h-0 flex flex-col">
                <div className="flex-1 min-h-0 overflow-auto p-4">
                  {selectedMyPackage ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <PackageIcon className="size-5 opacity-70" />
                        <div className="text-base font-semibold">{selectedMyPackage.name ?? "未命名素材箱"}</div>
                      </div>
                      <div className="text-sm opacity-70 whitespace-pre-wrap break-words">{selectedMyPackage.description ?? "暂无描述"}</div>
                      <div className="text-xs opacity-60">
                        导入后会生成局内素材箱副本，可独立编辑，不会发布到素材包广场。
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm opacity-60">左侧选择一个素材箱以查看详情并导入。</div>
                  )}
                </div>
                <div className="border-t border-base-300 px-4 py-3 flex items-center justify-end gap-2">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={closeImportFromMy} disabled={isMyImporting}>取消</button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => { void runImportFromMy(); }}
                    disabled={!selectedMyPackage || isMyImporting}
                  >
                    {isMyImporting ? "导入中…" : "导入到局内素材库"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={closeDeleteConfirm}
        title="删除局内素材箱"
        message="确认删除该素材箱吗？会清空其中所有子项。"
        onConfirm={() => { void handleDelete(); }}
        confirmText="删除"
        cancelText="取消"
        variant="danger"
      />
    </div>
  );
}

export default SpaceMaterialLibraryCategory;
