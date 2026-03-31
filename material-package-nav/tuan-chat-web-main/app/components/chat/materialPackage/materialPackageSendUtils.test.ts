import { describe, expect, it } from "vitest";

import type { MaterialPackageContent } from "@/components/materialPackage/materialPackageApi";
import type { MaterialPreviewPayload } from "@/components/chat/materialPackage/materialPackageDnd";
import { resolveMaterialMessagesFromPayload } from "@/components/chat/materialPackage/materialPackageSendUtils";

function msg(messageType: number, content?: string) {
  return { messageType, content, extra: {} };
}

describe("materialPackageSendUtils", () => {
  const content: MaterialPackageContent = {
    version: 1,
    root: [
      {
        type: "folder",
        name: "场景",
        children: [
          { type: "material", name: "温馨小屋", messages: [msg(2, "A1"), msg(2, "A2")] },
          { type: "material", name: "阴森地牢", messages: [msg(2, "B1")] },
        ],
      },
      { type: "material", name: "独立素材", messages: [msg(1, "C1")] },
    ],
  };

  it("kind=package：按树顺序收集整包消息", () => {
    const payload: MaterialPreviewPayload = { kind: "package", packageId: 1, label: "pkg", path: [] };
    const out = resolveMaterialMessagesFromPayload(content, payload);
    expect(out.map(x => x.content)).toEqual(["A1", "A2", "B1", "C1"]);
  });

  it("kind=folder：按 path 定位文件夹并收集消息", () => {
    const payload: MaterialPreviewPayload = { kind: "folder", packageId: 1, label: "场景", path: ["folder:场景"] };
    const out = resolveMaterialMessagesFromPayload(content, payload);
    expect(out.map(x => x.content)).toEqual(["A1", "A2", "B1"]);
  });

  it("kind=material：按 path 定位素材并收集消息", () => {
    const payload: MaterialPreviewPayload = { kind: "material", packageId: 1, label: "温馨小屋", path: ["folder:场景", "material:温馨小屋"] };
    const out = resolveMaterialMessagesFromPayload(content, payload);
    expect(out.map(x => x.content)).toEqual(["A1", "A2"]);
  });

  it("kind=material：当 path 缺少 material token 时回退使用 label", () => {
    const payload: MaterialPreviewPayload = { kind: "material", packageId: 1, label: "阴森地牢", path: ["folder:场景"] };
    const out = resolveMaterialMessagesFromPayload(content, payload);
    expect(out.map(x => x.content)).toEqual(["B1"]);
  });
});

