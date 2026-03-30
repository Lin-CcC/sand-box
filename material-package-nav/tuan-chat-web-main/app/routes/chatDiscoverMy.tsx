import type { Route } from "./+types/chatDiscoverMy";

import { Navigate } from "react-router";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "发现" },
    { name: "description", content: "发现 · 已迁移到我的素材包" },
  ];
}

export default function ChatDiscoverMyRoute() {
  return (
    <div className="bg-base-200 h-full w-full overflow-y-auto overflow-x-visible">
      <Navigate to="/chat/material-package" replace />
    </div>
  );
}
