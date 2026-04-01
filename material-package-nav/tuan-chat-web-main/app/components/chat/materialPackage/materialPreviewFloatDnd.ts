export type MpfViewMode = "icon" | "list";

export type MpfDropIntent = "reorderBefore" | "reorderAfter" | "moveInto" | "none";

export function computeMpfDropIntent(args: {
  viewMode: MpfViewMode;
  targetKind: "folder" | "material";
  targetRect: { left: number; top: number; width: number; height: number };
  clientX: number;
  clientY: number;
}): MpfDropIntent {
  const rect = args.targetRect;
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0)
    return "none";

  if (args.viewMode === "list") {
    const localY = args.clientY - rect.top;
    const edgeY = Math.min(10, rect.height * 0.35);
    if (localY <= edgeY)
      return "reorderBefore";
    if (localY >= rect.height - edgeY)
      return "reorderAfter";
    return args.targetKind === "folder" ? "moveInto" : "none";
  }

  const localX = args.clientX - rect.left;
  const edgeX = Math.min(10, rect.width * 0.35);
  if (localX <= edgeX)
    return "reorderBefore";
  if (localX >= rect.width - edgeX)
    return "reorderAfter";
  return args.targetKind === "folder" ? "moveInto" : "none";
}

