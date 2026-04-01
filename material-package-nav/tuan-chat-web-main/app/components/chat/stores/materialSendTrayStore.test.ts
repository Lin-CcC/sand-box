import { describe, expect, it } from "vitest";

import { useMaterialSendTrayStore } from "@/components/chat/stores/materialSendTrayStore";

function resetStore() {
  useMaterialSendTrayStore.setState({ isOpen: false, items: [] });
}

describe("materialSendTrayStore", () => {
  it("enqueueMany: 追加并自动打开", () => {
    resetStore();
    const { enqueueMany } = useMaterialSendTrayStore.getState() as any;
    enqueueMany([
      { kind: "material", packageId: 1, label: "A", path: ["material:A"] },
      { kind: "material", packageId: 1, label: "B", path: ["material:B"] },
    ]);
    const state = useMaterialSendTrayStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.items).toHaveLength(2);
  });

  it("replace: 覆盖并自动打开", () => {
    resetStore();
    const { enqueue, replace } = useMaterialSendTrayStore.getState() as any;
    enqueue({ kind: "material", packageId: 1, label: "OLD", path: ["material:OLD"] });
    replace([
      { kind: "material", packageId: 1, label: "NEW", path: ["material:NEW"] },
    ]);
    const state = useMaterialSendTrayStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.items).toHaveLength(1);
    expect(state.items[0]?.payload?.label).toBe("NEW");
  });
});
