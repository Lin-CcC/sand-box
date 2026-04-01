import { create } from "zustand";

import type { MaterialPreviewPayload } from "@/components/chat/materialPackage/materialPackageDnd";

export type MaterialSendTrayItem = {
  id: string;
  payload: MaterialPreviewPayload;
};

type MaterialSendTrayState = {
  isOpen: boolean;
  items: MaterialSendTrayItem[];
  open: () => void;
  close: () => void;
  toggle: () => void;
  enqueue: (payload: MaterialPreviewPayload) => void;
  enqueueMany: (payloads: MaterialPreviewPayload[]) => void;
  replace: (payloads: MaterialPreviewPayload[]) => void;
  remove: (id: string) => void;
  clear: () => void;
};

function generateId() {
  return `mst:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

export const useMaterialSendTrayStore = create<MaterialSendTrayState>(set => ({
  isOpen: false,
  items: [],
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set(prev => ({ isOpen: !prev.isOpen })),
  enqueue: (payload) => set(prev => ({
    isOpen: true,
    items: [...prev.items, { id: generateId(), payload }],
  })),
  enqueueMany: (payloads) => set(prev => ({
    isOpen: true,
    items: [
      ...prev.items,
      ...(Array.isArray(payloads) ? payloads.filter(Boolean).map(payload => ({ id: generateId(), payload })) : []),
    ],
  })),
  replace: (payloads) => set({
    isOpen: true,
    items: Array.isArray(payloads) ? payloads.filter(Boolean).map(payload => ({ id: generateId(), payload })) : [],
  }),
  remove: (id) => set(prev => ({ items: prev.items.filter(x => x.id !== id) })),
  clear: () => set({ items: [] }),
}));
