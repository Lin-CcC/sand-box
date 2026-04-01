import { describe, expect, it } from "vitest";

import { useMaterialSendConfirmStore } from "@/components/chat/stores/materialSendConfirmStore";

describe("materialSendConfirmStore", () => {
  it("opens and closes with payload", () => {
    useMaterialSendConfirmStore.setState({ isOpen: false, payload: null });

    useMaterialSendConfirmStore.getState().open({
      roomId: 12,
      roomLabel: "房间",
      count: 3,
      requests: [{ roomId: 12 } as any],
    });

    expect(useMaterialSendConfirmStore.getState().isOpen).toBe(true);
    expect(useMaterialSendConfirmStore.getState().payload?.roomId).toBe(12);

    useMaterialSendConfirmStore.getState().close();
    expect(useMaterialSendConfirmStore.getState().isOpen).toBe(false);
    expect(useMaterialSendConfirmStore.getState().payload).toBeNull();
  });
});

