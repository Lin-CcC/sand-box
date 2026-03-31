import type { SpaceMaterialPackageRecord } from "@/components/materialPackage/materialPackageApi";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import ConfirmModal from "@/components/common/comfirmModel";
import { useLocalStorage } from "@/components/common/customHooks/useLocalStorage";
import { buildEmptyMaterialPackageContent } from "@/components/chat/materialPackage/materialPackageDraft";
import { setMaterialPreviewDragData, setMaterialPreviewDragOrigin } from "@/components/chat/materialPackage/materialPackageDnd";
import MaterialPackageSquareView from "@/components/chat/materialPackage/materialPackageSquareView";
import { AddIcon, ChevronDown } from "@/icons";
import {
  createSpaceMaterialPackage,
  deleteSpaceMaterialPackage,
  getSpaceMaterialPackage,
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
}: {
  record: SpaceMaterialPackageRecord;
  useBackend: boolean;
  isExpanded: boolean;
  onToggleExpanded: () => void;
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

  const content = useBackend ? (query.data?.content ?? record.content) : record.content;
  const root = normalizeNodes((content as any)?.root);

  const renderNodes = (nodes: any[], folderPath: string[], depth: number) => {
    return nodes.map((node, index) => {
      if (!node || typeof node !== "object")
        return null;
      const key = `${depth}:${index}:${node.type}:${node.name}`;
      if (node.type === "folder") {
        const children = normalizeNodes(node.children);
        const nextPath = [...folderPath, node.name];
        const payloadPath = [...folderPath.map(makeFolderToken), makeFolderToken(node.name)];
        return (
          <div key={key}>
            <div
              className="flex items-center gap-1 py-1 pr-1 text-xs font-medium opacity-90 select-none rounded-md hover:bg-base-300/40"
              style={{ paddingLeft: 12 + depth * 14 }}
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
            >
              <span className="opacity-70">▸</span>
              <span className="truncate">{node.name}</span>
            </div>
            {renderNodes(children, nextPath, depth + 1)}
          </div>
        );
      }

      if (node.type === "material") {
        const payloadPath = [
          ...folderPath.map(makeFolderToken),
          makeMaterialToken(String(node.name ?? "")),
        ];
        return (
          <div
            key={key}
            className="flex items-center gap-1 py-1 pr-1 text-xs opacity-90 select-none rounded-md hover:bg-base-300/40"
            style={{ paddingLeft: 12 + depth * 14 }}
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
          >
            <span className="opacity-60">•</span>
            <span className="truncate">{node.name}</span>
          </div>
        );
      }

      return null;
    });
  };

  return (
    <div className="px-1 rounded-md">
      <div
        className={`flex items-center gap-1 py-1 pr-1 text-xs font-medium opacity-90 select-none rounded-md hover:bg-base-300/40`}
        onClick={onToggleExpanded}
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
        <span className="truncate">{record.name}</span>
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
  const isCollapsed = Boolean(collapsedBySpace[String(spaceId)]);
  const toggleCollapsed = useCallback(() => {
    setCollapsedBySpace(prev => ({ ...prev, [String(spaceId)]: !Boolean(prev[String(spaceId)]) }));
  }, [setCollapsedBySpace, spaceId]);

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
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const closeDeleteConfirm = () => {
    setIsDeleteConfirmOpen(false);
    setPendingDeleteId(null);
  };

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
      <div className="flex items-center gap-2 px-2 py-1 text-xs font-medium opacity-80 select-none rounded-lg hover:bg-base-300/40">
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
          <div className="dropdown dropdown-end">
            <button
              type="button"
              tabIndex={0}
              className="btn btn-ghost btn-xs"
              title="添加"
              aria-label="局内素材库操作"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <AddIcon />
            </button>
            <ul tabIndex={0} className="dropdown-content menu bg-base-100 rounded-box shadow-xl border border-base-300 z-50 w-44 p-2">
              <li>
                <button
                  type="button"
                  className="gap-2"
                  onClick={() => {
                    setIsImportOpen(true);
                  }}
                >
                  <span className="opacity-70">⇪</span>
                  <span className="flex-1 text-left">导入素材包</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="gap-2"
                  onClick={() => { void handleCreate(); }}
                >
                  <span className="opacity-70">＋</span>
                  <span className="flex-1 text-left">新建素材箱</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="gap-2"
                  onClick={() => { void listQuery.refetch(); }}
                >
                  <span className="opacity-70">⟳</span>
                  <span className="flex-1 text-left">刷新</span>
                </button>
              </li>
            </ul>
          </div>
        )}
      </div>

      {!isCollapsed && (
        <div className="rounded-lg border border-base-300 px-1 py-1 relative mx-2 mt-1 mb-1">
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
                />
                <div className="absolute top-1 right-1 hidden group-hover:flex items-center gap-1">
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleRename(pkg);
                    }}
                  >
                    重命名
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs text-error"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setPendingDeleteId(id);
                      setIsDeleteConfirmOpen(true);
                    }}
                  >
                    删除
                  </button>
                </div>
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
