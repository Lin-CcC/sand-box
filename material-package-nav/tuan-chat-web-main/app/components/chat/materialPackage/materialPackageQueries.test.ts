import { describe, expect, it } from "vitest";

import {
  buildMaterialPackageDetailQueryKey,
  buildMaterialPackageMyQueryKey,
} from "@/components/chat/materialPackage/materialPackageQueries";

describe("materialPackageQueries", () => {
  it("buildMaterialPackageMyQueryKey 会随数据源开关变化", () => {
    expect(buildMaterialPackageMyQueryKey(true)).not.toEqual(buildMaterialPackageMyQueryKey(false));
  });

  it("buildMaterialPackageDetailQueryKey 会随数据源开关变化", () => {
    expect(buildMaterialPackageDetailQueryKey(1, true)).not.toEqual(buildMaterialPackageDetailQueryKey(1, false));
  });
});

