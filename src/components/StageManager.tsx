"use client";

import { useCallback, useState, useEffect } from "react";
import { useChatFlowStore } from "@/store";
import FocusView from "./FocusView";
import NodeThumbnail from "./NodeThumbnail";

export default function StageManager() {
  const { nodes, activeNodeId, setActiveNode, resetCanvas, setViewMode } = useChatFlowStore();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const handleNewCanvas = useCallback(() => {
    if (nodes.length > 1 || nodes[0]?.data?.messages?.length > 0) {
      if (window.confirm("Start a new conversation? This will clear all current conversations.")) {
        resetCanvas();
      }
    } else {
      resetCanvas();
    }
  }, [nodes, resetCanvas]);

  // Listen for sidebar toggle event from FocusView
  useEffect(() => {
    const handleToggle = () => setIsSidebarCollapsed(v => !v);
    window.addEventListener('toggleSidebar', handleToggle);
    return () => window.removeEventListener('toggleSidebar', handleToggle);
  }, []);

  return (
    <div className="flex h-full bg-white dark:bg-zinc-900 relative">
      {/* Toggle button - shows in top-left when collapsed */}
      {isSidebarCollapsed && (
        <button
          onClick={() => setIsSidebarCollapsed(false)}
          className="absolute left-3 top-3 z-50 p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          title="Show sidebar"
        >
          <svg className="w-5 h-5 text-zinc-600 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8M4 18h16" />
          </svg>
        </button>
      )}

      {/* Sidebar with thumbnails */}
      <div 
        className={`shrink-0 flex flex-col overflow-hidden bg-white dark:bg-zinc-900 transition-all duration-300 ${
          isSidebarCollapsed ? "w-0" : "w-64"
        }`}
      >
        {/* Header */}
        <div className="p-3 flex items-center justify-between">
          <span className="text-lg font-medium text-zinc-900 dark:text-white px-1">ChatFlow</span>
          <button
            onClick={() => setIsSidebarCollapsed(true)}
            className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
            title="Hide sidebar"
          >
            <svg className="w-5 h-5 text-zinc-600 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Action buttons */}
        <div className="px-2 pb-3 space-y-1">
          <button
            onClick={handleNewCanvas}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-sm text-zinc-700 dark:text-zinc-300"
            title="New Conversation"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>New chat</span>
          </button>
          <button
            onClick={() => setViewMode("canvas")}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-sm text-zinc-700 dark:text-zinc-300"
            title="Canvas View"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
            <span>Canvas</span>
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-zinc-200 dark:bg-zinc-800 mx-2" />

        {/* Node list */}
        <div className="flex-1 p-2 space-y-1 overflow-y-auto">
          {nodes.map((node) => (
            <NodeThumbnail
              key={node.id}
              nodeId={node.id}
              isActive={node.id === activeNodeId}
              onClick={() => setActiveNode(node.id)}
            />
          ))}
        </div>
      </div>

      {/* Main content area - fullscreen for active node */}
      <div className="flex-1 h-full bg-white dark:bg-zinc-900 shadow-xl relative">
        <FocusView nodeId={activeNodeId} />
      </div>
    </div>
  );
}
