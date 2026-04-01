import { describe, expect, it } from "vitest";

import { parseSpaceLibrarySelectedNodeRef, toggleExpandedIds } from "@/components/chat/materialPackage/spaceMaterialLibraryOps";

describe("spaceMaterialLibraryOps", () => {
  it("parse material node key -> parentPath + name", () => {
    const parsed = parseSpaceLibrarySelectedNodeRef({
      kind: "material",
      packageId: 12,
      key: "material:12:folder:场景/folder:小屋/material:温馨.png",
    });
    expect(parsed).toEqual({
      kind: "material",
      packageId: 12,
      parentPath: ["场景", "小屋"],
      name: "温馨.png",
    });
  });

  it("parse folder node key -> parentPath + name", () => {
    const parsed = parseSpaceLibrarySelectedNodeRef({
      kind: "folder",
      packageId: 12,
      key: "folder:12:folder:场景/folder:小屋",
    });
    expect(parsed).toEqual({
      kind: "folder",
      packageId: 12,
      parentPath: ["场景"],
      name: "小屋",
    });
  });

  it("parse package returns null", () => {
    const parsed = parseSpaceLibrarySelectedNodeRef({
      kind: "package",
      packageId: 12,
      key: "root:12",
    });
    expect(parsed).toBeNull();
  });

  it("toggleExpandedIds adds/removes id", () => {
    expect(toggleExpandedIds([], 3)).toEqual([3]);
    expect(toggleExpandedIds([3], 3)).toEqual([]);
    expect(toggleExpandedIds([1, 2], 3)).toEqual([1, 2, 3]);
    expect(toggleExpandedIds([1, 3, 2], 3)).toEqual([1, 2]);
  });
});

