export const MATERIAL_PREVIEW_DRAG_TYPE = "application/x-tc-material-preview";
export const MATERIAL_PREVIEW_DRAG_ORIGIN_TYPE = "application/x-tc-material-preview-origin";

export type MaterialPackageScope = "global" | "space";

export type MaterialPreviewPayload = {
  /** scope 缺省表示局外（global），兼容旧数据 */
  scope?: MaterialPackageScope;
  /** scope=space 时，用于读取局内素材库数据 */
  spaceId?: number;
  kind: "package" | "folder" | "material";
  /** 对 global：packageId；对 space：spacePackageId */
  packageId: number;
  label: string;
  path: string[];
};

export type MaterialPreviewDragOrigin = "tree" | "docked";

let activeMaterialPreviewDrag: MaterialPreviewPayload | null = null;
let activeMaterialPreviewDragOrigin: MaterialPreviewDragOrigin | null = null;

export function getActiveMaterialPreviewDragPayload() {
  return activeMaterialPreviewDrag;
}

export function clearActiveMaterialPreviewDragPayload() {
  activeMaterialPreviewDrag = null;
  activeMaterialPreviewDragOrigin = null;
}

export function setMaterialPreviewDragData(dataTransfer: DataTransfer, payload: MaterialPreviewPayload) {
  activeMaterialPreviewDrag = payload;
  try {
    dataTransfer.setData(MATERIAL_PREVIEW_DRAG_TYPE, JSON.stringify(payload));
  }
  catch {
    // ignore
  }

  try {
    // Fallback channel for environments that block custom MIME types.
    dataTransfer.setData("text/plain", `tc-material-preview:${JSON.stringify(payload)}`);
  }
  catch {
    // ignore
  }
}

export function setMaterialPreviewDragOrigin(dataTransfer: DataTransfer, origin: MaterialPreviewDragOrigin) {
  activeMaterialPreviewDragOrigin = origin;
  try {
    dataTransfer.setData(MATERIAL_PREVIEW_DRAG_ORIGIN_TYPE, origin);
  }
  catch {
    // ignore
  }
}

export function getMaterialPreviewDragOrigin(dataTransfer: DataTransfer | null): MaterialPreviewDragOrigin | null {
  if (!dataTransfer)
    return null;

  try {
    const raw = dataTransfer.getData(MATERIAL_PREVIEW_DRAG_ORIGIN_TYPE);
    if (raw === "tree" || raw === "docked")
      return raw;
  }
  catch {
    // ignore
  }

  return activeMaterialPreviewDragOrigin;
}

export function getMaterialPreviewDragData(dataTransfer: DataTransfer | null): MaterialPreviewPayload | null {
  if (!dataTransfer)
    return null;
  try {
    const raw = dataTransfer.getData(MATERIAL_PREVIEW_DRAG_TYPE);
    if (!raw)
      return null;
    const parsed = JSON.parse(raw) as Partial<MaterialPreviewPayload> | null;
    if (!parsed || typeof parsed !== "object")
      return null;
    if (parsed.kind !== "package" && parsed.kind !== "folder" && parsed.kind !== "material")
      return null;
    if (typeof parsed.packageId !== "number" || !Number.isFinite(parsed.packageId) || parsed.packageId <= 0)
      return null;
    if (typeof parsed.label !== "string" || !parsed.label.trim())
      return null;
    const path = Array.isArray(parsed.path) ? parsed.path.filter(s => typeof s === "string") : [];
    const scope = parsed.scope === "space" || parsed.scope === "global" ? parsed.scope : undefined;
    const spaceId = typeof parsed.spaceId === "number" && Number.isFinite(parsed.spaceId) && parsed.spaceId > 0 ? parsed.spaceId : undefined;
    return {
      ...(scope ? { scope } : {}),
      ...(spaceId ? { spaceId } : {}),
      kind: parsed.kind,
      packageId: parsed.packageId,
      label: parsed.label,
      path,
    };
  }
  catch {
    // ignore
  }

  // Fallback: parse from text/plain
  try {
    const raw = dataTransfer.getData("text/plain") || "";
    const prefix = "tc-material-preview:";
    if (!raw.startsWith(prefix))
      return null;
    const parsed = JSON.parse(raw.slice(prefix.length)) as Partial<MaterialPreviewPayload> | null;
    if (!parsed || typeof parsed !== "object")
      return null;
    if (parsed.kind !== "package" && parsed.kind !== "folder" && parsed.kind !== "material")
      return null;
    if (typeof parsed.packageId !== "number" || !Number.isFinite(parsed.packageId) || parsed.packageId <= 0)
      return null;
    if (typeof parsed.label !== "string" || !parsed.label.trim())
      return null;
    const path = Array.isArray(parsed.path) ? parsed.path.filter(s => typeof s === "string") : [];
    const scope = parsed.scope === "space" || parsed.scope === "global" ? parsed.scope : undefined;
    const spaceId = typeof parsed.spaceId === "number" && Number.isFinite(parsed.spaceId) && parsed.spaceId > 0 ? parsed.spaceId : undefined;
    return {
      ...(scope ? { scope } : {}),
      ...(spaceId ? { spaceId } : {}),
      kind: parsed.kind,
      packageId: parsed.packageId,
      label: parsed.label,
      path,
    };
  }
  catch {
    // ignore
  }

  return activeMaterialPreviewDrag;
}

export function isMaterialPreviewDrag(dataTransfer: DataTransfer | null) {
  if (!dataTransfer)
    return false;
  try {
    return dataTransfer.types.includes(MATERIAL_PREVIEW_DRAG_TYPE);
  }
  catch {
    // ignore
  }

  // Some browser / runtime combos don't reliably expose custom MIME types via `dataTransfer.types`
  // during `dragover`. Fallback to checking whether data exists.
  try {
    return Boolean(dataTransfer.getData(MATERIAL_PREVIEW_DRAG_TYPE));
  }
  catch {
    // ignore
  }

  return Boolean(activeMaterialPreviewDrag);
}
