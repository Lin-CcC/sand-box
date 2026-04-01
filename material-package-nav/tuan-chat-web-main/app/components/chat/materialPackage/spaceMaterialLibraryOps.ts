export function toggleExpandedIds(prev: number[], id: number) {
  const nextId = Number(id);
  if (!Number.isFinite(nextId) || nextId <= 0)
    return prev;
  const base = Array.isArray(prev) ? prev.filter(n => Number.isFinite(Number(n)) && Number(n) > 0).map(n => Number(n)) : [];
  if (base.includes(nextId))
    return base.filter(n => n !== nextId);
  return [...base, nextId];
}

export function parseSpaceLibrarySelectedNodeRef(selected: {
  kind: "package" | "folder" | "material";
  key: string;
  packageId: number;
}): null | { kind: "folder" | "material"; packageId: number; parentPath: string[]; name: string } {
  if (!selected || selected.kind === "package")
    return null;

  const packageId = Number(selected.packageId);
  if (!Number.isFinite(packageId) || packageId <= 0)
    return null;

  const marker = `:${packageId}:`;
  const idx = selected.key.indexOf(marker);
  if (idx < 0)
    return null;

  const rest = selected.key.slice(idx + marker.length);
  const tokens = rest ? rest.split("/").filter(Boolean) : [];
  if (!tokens.length)
    return null;

  const folderNames = tokens
    .filter(t => typeof t === "string" && t.startsWith("folder:"))
    .map(t => t.slice("folder:".length))
    .filter(Boolean);

  if (selected.kind === "material") {
    const last = tokens[tokens.length - 1] ?? "";
    const name = typeof last === "string" && last.startsWith("material:")
      ? last.slice("material:".length).trim()
      : "";
    if (!name)
      return null;
    return { kind: "material", packageId, parentPath: folderNames, name };
  }

  const name = folderNames[folderNames.length - 1]?.trim() ?? "";
  if (!name)
    return null;
  return { kind: "folder", packageId, parentPath: folderNames.slice(0, -1), name };
}

