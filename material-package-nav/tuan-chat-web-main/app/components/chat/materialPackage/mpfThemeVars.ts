import type React from "react";

import { useEffect, useMemo, useState } from "react";

function isDarkThemeActive() {
  if (typeof document === "undefined")
    return true;
  const root = document.documentElement;
  const theme = (root.dataset.theme ?? "").toLowerCase();
  return theme.includes("dark") || root.classList.contains("dark");
}

export function useMpfThemeVars() {
  const [isDarkTheme, setIsDarkTheme] = useState(() => isDarkThemeActive());

  useEffect(() => {
    if (typeof document === "undefined")
      return;
    const root = document.documentElement;
    const update = () => setIsDarkTheme(isDarkThemeActive());
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => observer.disconnect();
  }, []);

  return useMemo(() => {
    // Follow global theme (light/dark), but keep a consistent "mpf" tone and avoid pure black/white.
    if (isDarkTheme) {
      return {
        "--tc-mpf-bg": "#1c232d",
        "--tc-mpf-surface": "#202836",
        "--tc-mpf-surface-2": "#293245",
        "--tc-mpf-surface-3": "#242d3d",
        "--tc-mpf-toolbar": "#1f2735",
        "--tc-mpf-input-bg": "#151b24",
        "--tc-mpf-border": "#35455e",
        "--tc-mpf-border-strong": "#425674",
        "--tc-mpf-text": "#e7ebf3",
        "--tc-mpf-muted": "#a4adbb",
        "--tc-mpf-crumb": "#b8c0cd",
        "--tc-mpf-icon": "#b9c2d0",
        "--tc-mpf-icon-hover": "#eef2f8",
        "--tc-mpf-accent": "#78a6ff",
        "--tc-mpf-danger": "#ff6b7a",
        "--tc-mpf-danger-hover": "#ff4a5f",
        "--tc-mpf-danger-ring": "#a53542",
        "--tc-mpf-selected": "#233452",
        "--tc-mpf-dot-border": "#41506a",
        "--tc-mpf-dot-folder": "#95a2b8",
        "--tc-mpf-dot-file": "#78a6ff",
        "--tc-mpf-shadow": "0 18px 40px rgba(0, 0, 0, 0.34)",
        "--tc-mpf-range-track": "rgba(255, 255, 255, 0.18)",
        "--tc-mpf-range-thumb": "rgba(170, 210, 255, 0.86)",
        "--tc-mpf-grip": "#7b8699",
      } as unknown as React.CSSProperties;
    }

    return {
      "--tc-mpf-bg": "#e9eef6",
      "--tc-mpf-surface": "#f2f5fa",
      "--tc-mpf-surface-2": "#e4ebf5",
      "--tc-mpf-surface-3": "#dbe4f1",
      "--tc-mpf-toolbar": "#eef2f8",
      "--tc-mpf-input-bg": "#f7f9fc",
      "--tc-mpf-border": "#b7c3d6",
      "--tc-mpf-border-strong": "#a7b6cd",
      "--tc-mpf-text": "#1e2633",
      "--tc-mpf-muted": "#5b6678",
      "--tc-mpf-crumb": "#3b4658",
      "--tc-mpf-icon": "#465164",
      "--tc-mpf-icon-hover": "#1e2633",
      "--tc-mpf-accent": "#2f6eea",
      "--tc-mpf-danger": "#d64553",
      "--tc-mpf-danger-hover": "#be3643",
      "--tc-mpf-danger-ring": "#e7a6ad",
      "--tc-mpf-selected": "#d7e5ff",
      "--tc-mpf-dot-border": "#9fb0c9",
      "--tc-mpf-dot-folder": "#6c7a91",
      "--tc-mpf-dot-file": "#2f6eea",
      "--tc-mpf-shadow": "0 18px 40px rgba(13, 22, 35, 0.16)",
      "--tc-mpf-range-track": "rgba(30, 38, 51, 0.20)",
      "--tc-mpf-range-thumb": "rgba(47, 110, 234, 0.75)",
      "--tc-mpf-grip": "#74839b",
    } as unknown as React.CSSProperties;
  }, [isDarkTheme]);
}

