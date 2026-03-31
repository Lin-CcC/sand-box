import type { ChatMessageRequest } from "../../../../api/models/ChatMessageRequest";

import type {
  MaterialFolderNode,
  MaterialMessageItem,
  MaterialNode,
  MaterialPackageContent,
} from "@/components/materialPackage/materialPackageApi";

import type { MaterialPreviewPayload } from "@/components/chat/materialPackage/materialPackageDnd";

type PayloadPathToken = { type: "folder" | "material"; name: string };

function parsePayloadPath(path: string[] | undefined | null): PayloadPathToken[] {
  const parts = Array.isArray(path) ? path : [];
  const tokens: PayloadPathToken[] = [];
  for (const part of parts) {
    if (typeof part !== "string")
      continue;
    if (part.startsWith("folder:")) {
      const name = part.slice("folder:".length).trim();
      if (name)
        tokens.push({ type: "folder", name });
      continue;
    }
    if (part.startsWith("material:")) {
      const name = part.slice("material:".length).trim();
      if (name)
        tokens.push({ type: "material", name });
      continue;
    }
  }
  return tokens;
}

function collectMessages(nodes: MaterialNode[]): MaterialMessageItem[] {
  const list: MaterialMessageItem[] = [];
  for (const node of nodes) {
    if (!node)
      continue;
    if (node.type === "material") {
      const msgs = Array.isArray(node.messages) ? node.messages : [];
      for (const m of msgs) {
        if (m)
          list.push(m);
      }
      continue;
    }
    if (node.type === "folder") {
      list.push(...collectMessages(Array.isArray(node.children) ? node.children : []));
    }
  }
  return list;
}

function findFolder(nodes: MaterialNode[], folderName: string): MaterialFolderNode | null {
  for (const node of nodes) {
    if (node?.type === "folder" && node.name === folderName) {
      return node as MaterialFolderNode;
    }
  }
  return null;
}

export function resolveMaterialMessagesFromPayload(
  content: MaterialPackageContent | null | undefined,
  payload: MaterialPreviewPayload | null | undefined,
): MaterialMessageItem[] {
  if (!payload)
    return [];
  const root = Array.isArray(content?.root) ? content.root : [];

  const tokens = parsePayloadPath(payload.path);

  if (payload.kind === "package") {
    return collectMessages(root);
  }

  let currentNodes: MaterialNode[] = root;
  for (const token of tokens) {
    if (token.type !== "folder")
      break;
    const folder = findFolder(currentNodes, token.name);
    if (!folder)
      return [];
    currentNodes = Array.isArray(folder.children) ? folder.children : [];
  }

  if (payload.kind === "folder") {
    return collectMessages(currentNodes);
  }

  let materialName = "";
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    if (token?.type === "material") {
      materialName = token.name;
      break;
    }
  }
  if (!materialName) {
    materialName = String(payload.label ?? "").trim();
  }
  if (!materialName)
    return [];

  const mat = currentNodes.find(n => n?.type === "material" && n.name === materialName);
  if (!mat || mat.type !== "material")
    return [];
  const msgs = Array.isArray(mat.messages) ? mat.messages : [];
  return msgs.filter(Boolean) as MaterialMessageItem[];
}

export function materialMessagesToChatRequests(roomId: number, messages: MaterialMessageItem[]): ChatMessageRequest[] {
  const list = Array.isArray(messages) ? messages : [];
  return list.map((m) => {
    const extra = (m && typeof m.extra === "object" && m.extra) ? m.extra : {};
    return {
      roomId,
      messageType: Number(m.messageType),
      content: typeof m.content === "string" ? m.content : undefined,
      annotations: Array.isArray(m.annotations) ? m.annotations : undefined,
      extra,
      webgal: (m && typeof m.webgal === "object" && m.webgal) ? m.webgal : undefined,
      roleId: typeof m.roleId === "number" ? m.roleId : undefined,
      avatarId: typeof m.avatarId === "number" ? m.avatarId : undefined,
    };
  });
}

