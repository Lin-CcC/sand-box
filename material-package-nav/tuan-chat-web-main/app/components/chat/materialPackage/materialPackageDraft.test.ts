import { describe, expect, it } from "vitest";

import type { MaterialPackageContent } from "@/components/materialPackage/materialPackageApi";
import {
  buildEmptyMaterialPackageContent,
  draftCreateFolder,
  draftCreateMaterial,
  draftDeleteFolder,
  draftDeleteMaterial,
  draftRenameFolder,
  draftRenameMaterial,
} from "@/components/chat/materialPackage/materialPackageDraft";

describe("materialPackageDraft", () => {
  it("支持在 root 创建文件夹", () => {
    const base = buildEmptyMaterialPackageContent();
    const next = draftCreateFolder(base, [], "场景");
    expect(next.root).toHaveLength(1);
    expect(next.root[0]).toMatchObject({ type: "folder", name: "场景" });
  });

  it("支持在多级目录创建素材", () => {
    const base: MaterialPackageContent = {
      version: 1,
      root: [
        { type: "folder", name: "场景", children: [] },
      ],
    };
    const next = draftCreateMaterial(base, ["场景"], {
      type: "material",
      name: "温馨小屋",
      note: "开场背景",
      messages: [{ messageType: 2, extra: {} }],
    });
    const folder = next.root[0] as any;
    expect(folder.children).toHaveLength(1);
    expect(folder.children[0]).toMatchObject({ type: "material", name: "温馨小屋", note: "开场背景" });
  });

  it("支持重命名文件夹与素材（含 note）", () => {
    const base: MaterialPackageContent = {
      version: 1,
      root: [
        {
          type: "folder",
          name: "场景",
          children: [
            { type: "material", name: "温馨小屋", note: "", messages: [{ messageType: 2, extra: {} }] },
          ],
        },
      ],
    };

    const renamedFolder = draftRenameFolder(base, [], "场景", "背景");
    expect(renamedFolder.root[0]).toMatchObject({ type: "folder", name: "背景" });

    const renamedMaterial = draftRenameMaterial(renamedFolder, ["背景"], "温馨小屋", "温暖小屋", "新备注");
    const folder = renamedMaterial.root[0] as any;
    expect(folder.children[0]).toMatchObject({ type: "material", name: "温暖小屋", note: "新备注" });
  });

  it("支持删除文件夹（递归）与删除素材", () => {
    const base: MaterialPackageContent = {
      version: 1,
      root: [
        {
          type: "folder",
          name: "场景",
          children: [
            { type: "folder", name: "小屋", children: [] },
          ],
        },
        { type: "material", name: "独立素材", messages: [{ messageType: 2, extra: {} }] },
      ],
    };
    const deletedMaterial = draftDeleteMaterial(base, [], "独立素材");
    expect(deletedMaterial.root.some(n => n.type === "material")).toBe(false);

    const deletedFolder = draftDeleteFolder(deletedMaterial, [], "场景");
    expect(deletedFolder.root).toHaveLength(0);
  });
});

