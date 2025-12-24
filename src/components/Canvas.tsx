"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useChatFlowStore } from "@/store";
import StageManager from "./StageManager";
import CanvasView from "./CanvasView";
import SettingsPanel from "./SettingsPanel";

// Use useSyncExternalStore to safely detect hydration
const emptySubscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export default function Canvas() {
  const isHydrated = useSyncExternalStore(emptySubscribe, getSnapshot, getServerSnapshot);
  const { nodes, activeNodeId, setActiveNode, viewMode, theme } =
    useChatFlowStore();

  // Handle theme changes
  useEffect(() => {
    const root = window.document.documentElement;
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList.toggle('dark', isDark);

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => root.classList.toggle('dark', e.matches);
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [theme]);

  // Ensure activeNodeId is valid
  useEffect(() => {
    if (isHydrated && !nodes.find((n) => n.id === activeNodeId)) {
      setActiveNode(nodes[0]?.id || "root");
    }
  }, [nodes, activeNodeId, setActiveNode, isHydrated]);

  if (!isHydrated) {
    return (
      <div className="w-screen h-screen bg-white dark:bg-zinc-900 flex items-center justify-center">
        <div className="animate-pulse text-zinc-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen">
      {/* Main content based on view mode */}
      {viewMode === "canvas" ? (
        <CanvasView />
      ) : (
        <StageManager />
      )}

      {/* Settings panel (fixed position) */}
      <SettingsPanel />
    </div>
  );
}
