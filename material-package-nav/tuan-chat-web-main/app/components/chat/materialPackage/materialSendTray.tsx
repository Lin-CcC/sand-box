import type { ChatMessageRequest } from "../../../../api/models/ChatMessageRequest";

import React, { use, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

import { getMaterialPreviewDragData, isMaterialPreviewDrag } from "@/components/chat/materialPackage/materialPackageDnd";
import { materialMessagesToChatRequests, resolveMaterialMessagesFromPayload } from "@/components/chat/materialPackage/materialPackageSendUtils";
import { RoomContext } from "@/components/chat/core/roomContext";
import { useMaterialSendTrayStore } from "@/components/chat/stores/materialSendTrayStore";
import { getMaterialPackage, getSpaceMaterialPackage } from "@/components/materialPackage/materialPackageApi";
import { useLocalStorage } from "@/components/common/customHooks/useLocalStorage";
import { useGetUserRoomsQuery } from "../../../../api/hooks/chatQueryHooks";
import { tuanchat } from "../../../../api/instance";

function readUseBackendFlag(): boolean {
  const defaultUseBackend = !(import.meta.env.MODE === "test");
  let useBackend = defaultUseBackend;
  try {
    const raw = localStorage.getItem("tc:material-package:use-backend");
    if (raw != null)
      useBackend = raw === "true";
  }
  catch {
    // ignore
  }
  return useBackend;
}

export default function MaterialSendTray() {
  const roomContext = use(RoomContext);
  const roomId = Number(roomContext.roomId ?? -1);
  const spaceId = Number(roomContext.spaceId ?? -1);
  const curRoleId = Number(roomContext.curRoleId ?? -1);
  const curAvatarId = Number(roomContext.curAvatarId ?? -1);
  const sendMessageWithInsert = roomContext.sendMessageWithInsert;

  const roomsQuery = useGetUserRoomsQuery(spaceId > 0 ? spaceId : -1);
  const rooms = roomsQuery.data?.data?.rooms ?? [];
  const availableRooms = useMemo(() => {
    return Array.isArray(rooms)
      ? rooms.filter(r => typeof r?.roomId === "number" && Number.isFinite(r.roomId) && r.roomId > 0)
      : [];
  }, [rooms]);

  const [targetRoomBySpace, setTargetRoomBySpace] = useLocalStorage<Record<string, number>>("tc:material-send-tray:target-room-by-space", {});
  const storedTargetRoomId = spaceId > 0 ? targetRoomBySpace[String(spaceId)] : undefined;
  const [targetRoomId, setTargetRoomId] = useState<number>(() => {
    if (typeof storedTargetRoomId === "number" && storedTargetRoomId > 0)
      return storedTargetRoomId;
    return roomId;
  });
  const invalidTargetToastRef = useRef<string | null>(null);

  const isOpen = useMaterialSendTrayStore(s => s.isOpen);
  const items = useMaterialSendTrayStore(s => s.items);
  const toggle = useMaterialSendTrayStore(s => s.toggle);
  const close = useMaterialSendTrayStore(s => s.close);
  const enqueue = useMaterialSendTrayStore(s => s.enqueue);
  const remove = useMaterialSendTrayStore(s => s.remove);
  const clear = useMaterialSendTrayStore(s => s.clear);

  const [isSending, setIsSending] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  const hasValidTargetRoom = targetRoomId > 0;
  const canSend = hasValidTargetRoom && items.length > 0 && !isSending;
  const isCompact = !isOpen && items.length === 0;

  useEffect(() => {
    if (roomId > 0 && (!targetRoomId || targetRoomId <= 0)) {
      setTargetRoomId(roomId);
    }
  }, [roomId, targetRoomId]);

  useEffect(() => {
    if (spaceId <= 0)
      return;
    if (!availableRooms.length)
      return;
    const exists = availableRooms.some(r => r.roomId === targetRoomId);
    if (exists)
      return;
    const fallback = roomId > 0 ? roomId : Number(availableRooms[0]?.roomId ?? -1);
    if (fallback > 0) {
      setTargetRoomId(fallback);
      if (invalidTargetToastRef.current !== String(spaceId)) {
        invalidTargetToastRef.current = String(spaceId);
        toast("目标房间不可用，已自动回退到当前房间。", { icon: "ℹ️" });
      }
    }
  }, [availableRooms, roomId, spaceId, targetRoomId]);

  useEffect(() => {
    if (spaceId <= 0)
      return;
    if (targetRoomId <= 0)
      return;
    setTargetRoomBySpace(prev => ({ ...prev, [String(spaceId)]: targetRoomId }));
  }, [setTargetRoomBySpace, spaceId, targetRoomId]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ roomId?: number }>)?.detail;
      const nextRoomId = Number(detail?.roomId ?? -1);
      if (!Number.isFinite(nextRoomId) || nextRoomId <= 0)
        return;
      setTargetRoomId(prev => (prev === nextRoomId ? prev : nextRoomId));
    };
    window.addEventListener("tc:material-send-tray:set-target-room", handler as EventListener);
    return () => window.removeEventListener("tc:material-send-tray:set-target-room", handler as EventListener);
  }, []);

  const summary = useMemo(() => {
    if (!items.length)
      return "空";
    return `${items.length} 项`;
  }, [items.length]);

  const handleSend = async () => {
    if (!canSend)
      return;

    const useBackend = readUseBackendFlag();
    if (!useBackend) {
      toast.success("mock：已模拟发送队列（不写入后端）。");
      clear();
      close();
      return;
    }

    setIsSending(true);
    const toastId = "material-send-tray-send";
      toast.loading("正在发送队列…", { id: toastId });
    try {
      const requests: ChatMessageRequest[] = [];
      for (const item of items) {
        const payload = item.payload;
        const pkg = payload.scope === "space"
          ? await getSpaceMaterialPackage(payload.packageId)
          : await getMaterialPackage(payload.packageId);
        const messages = resolveMaterialMessagesFromPayload(pkg?.content, payload);
        const mapped = materialMessagesToChatRequests(targetRoomId, messages).map((req) => {
          const next: ChatMessageRequest = { ...req };
          if ((next.roleId == null || next.roleId <= 0) && curRoleId > 0)
            next.roleId = curRoleId;
          if ((next.avatarId == null || next.avatarId <= 0) && curAvatarId > 0)
            next.avatarId = curAvatarId;
          return next;
        });
        requests.push(...mapped);
      }

      if (!requests.length) {
        toast("队列项没有可发送的消息。", { id: toastId });
        return;
      }

      if (sendMessageWithInsert && targetRoomId === roomId) {
        for (const req of requests) {
          // eslint-disable-next-line no-await-in-loop
          await sendMessageWithInsert(req);
        }
      }
      else {
        for (const req of requests) {
          // eslint-disable-next-line no-await-in-loop
          await tuanchat.chatController.sendMessage1(req);
        }
      }

      toast.success(`已发送 ${requests.length} 条消息`, { id: toastId });
      clear();
      close();
    }
    catch (error) {
      const message = error instanceof Error ? error.message : "发送失败";
      toast.error(message, { id: toastId });
    }
    finally {
      setIsSending(false);
    }
  };

  return (
    <div className="absolute bottom-3 right-3 z-[70] pointer-events-none">
      <div
        className={`pointer-events-auto select-none rounded-xl border border-base-300 bg-base-100/95 backdrop-blur shadow-lg ${isCompact ? "w-[180px]" : "w-[320px]"} ${isDragActive ? "ring-2 ring-info/40" : ""}`}
        onDragEnter={(e) => {
          if (!isMaterialPreviewDrag(e.dataTransfer))
            return;
          e.preventDefault();
          e.stopPropagation();
          setIsDragActive(true);
        }}
        onDragOver={(e) => {
          if (!isMaterialPreviewDrag(e.dataTransfer))
            return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "copy";
          setIsDragActive(true);
        }}
        onDragLeave={() => {
          setIsDragActive(false);
        }}
        onDrop={(e) => {
          if (!isMaterialPreviewDrag(e.dataTransfer))
            return;
          e.preventDefault();
          e.stopPropagation();
          setIsDragActive(false);
          const payload = getMaterialPreviewDragData(e.dataTransfer);
          if (!payload)
            return;
          enqueue(payload);
          toast.success("已加入素材队列");
        }}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <button
            type="button"
            className="btn btn-ghost btn-xs px-2"
            onClick={toggle}
            aria-label="切换素材队列展开"
          >
            <span className="font-semibold">素材队列</span>
            <span className="ml-1 text-[11px] opacity-60">{summary}</span>
          </button>
          <div className="flex items-center gap-1">
            {!isCompact && (
              <>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => { clear(); }}
                  disabled={isSending || items.length === 0}
                >
                  清空
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-xs"
                  onClick={handleSend}
                  disabled={!canSend}
                >
                  {isSending ? "发送中…" : "发送"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={close}
                  aria-label="收起素材队列"
                >
                  ×
                </button>
              </>
            )}
          </div>
        </div>

        {isOpen && (
          <div className="px-2 pb-2">
            {items.length === 0 && (
              <div className="px-2 py-2 text-xs text-base-content/60">
                拖素材到这里加入队列，然后点“发送”。
              </div>
            )}
            {items.length > 0 && (
              <div className="max-h-[220px] overflow-y-auto">
                {items.map((item, idx) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-base-200/50">
                    <div className="min-w-0 text-xs">
                      <span className="opacity-60 mr-2">{idx + 1}.</span>
                      <span className="truncate">{item.payload.label}</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => remove(item.id)}
                      disabled={isSending}
                      aria-label="移除队列项"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 px-2">
              <div className="flex items-center gap-2">
                <div className="text-[11px] text-base-content/60 shrink-0">目标房间</div>
                <select
                  className="select select-bordered select-xs w-full"
                  value={hasValidTargetRoom ? String(targetRoomId) : ""}
                  disabled={isSending || availableRooms.length === 0}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    if (Number.isFinite(next) && next > 0)
                      setTargetRoomId(next);
                  }}
                  aria-label="选择目标房间"
                >
                  {availableRooms.length === 0 && (
                    <option value="">暂无可用房间</option>
                  )}
                  {availableRooms.map((r) => {
                    const rid = Number(r.roomId);
                    const label = String(r.name ?? `房间 #${rid}`);
                    return (
                      <option key={rid} value={String(rid)}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
