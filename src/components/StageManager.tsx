"use client";

import { useCallback, useState, useEffect } from "react";
import { useChatFlowStore } from "@/store";
import FocusView from "./FocusView";
import TreeNode from "./TreeNode";
import { buildTree } from "@/utils/treeBuilder";
import { toast } from "sonner";

export default function StageManager() {
  const { 
    activeNodeId, 
    setActiveNode, 
    sessions,
    activeSessionId,
    createSession,
    deleteSession,
    switchSession,
    removeNode,
  } = useChatFlowStore();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const handleNewSession = useCallback(() => {
    createSession();
  }, [createSession]);

  const handleDeleteSession = useCallback((sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Use toast for confirmation
    toast.warning("Delete this conversation?", {
      description: "This action cannot be undone.",
      action: {
        label: "Delete",
        onClick: () => {
          deleteSession(sessionId);
          toast.success("Conversation deleted");
        },
      },
      cancel: {
        label: "Cancel",
        onClick: () => {},
      },
    });
  }, [deleteSession]);

  const handleDeleteNode = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Use toast for confirmation
    toast.warning("Delete this branch?", {
      description: "This will also delete all sub-branches.",
      action: {
        label: "Delete",
        onClick: () => {
          removeNode(nodeId);
          toast.success("Branch deleted");
        },
      },
      cancel: {
        label: "Cancel",
        onClick: () => {},
      },
    });
  }, [removeNode]);

  // Component to render tree structure for a session
  const TreeNodeComponent = ({ 
    session, 
    activeNodeId, 
    onNodeClick, 
    onNodeDelete 
  }: { 
    session: typeof sessions[0]; 
    activeNodeId: string; 
    onNodeClick: (id: string) => void;
    onNodeDelete: (id: string, e: React.MouseEvent) => void;
  }) => {
    const tree = buildTree(session.nodes, session.edges, session.rootNodeId, activeNodeId);
    if (!tree) return null;
    
    // Only render children, not the root node itself
    // The root is already represented by the conversation title
    if (tree.children.length === 0) return null;
    
    return (
      <div>
        {tree.children.map((child) => (
          <TreeNode
            key={child.node.id}
            node={child.node}
            childNodes={child.children}
            depth={0}
            isActive={child.isActive}
            onClick={onNodeClick}
            onDelete={onNodeDelete}
            isRoot={false}
          />
        ))}
      </div>
    );
  };

  // Listen for sidebar toggle event from FocusView
  useEffect(() => {
    const handleToggle = () => setIsSidebarCollapsed(v => !v);
    window.addEventListener('toggleSidebar', handleToggle);
    return () => window.removeEventListener('toggleSidebar', handleToggle);
  }, []);

  // Broadcast sidebar state to FocusView
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('sidebarState', { detail: { collapsed: isSidebarCollapsed } }));
  }, [isSidebarCollapsed]);

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
        className={`shrink-0 flex flex-col overflow-hidden bg-white dark:bg-zinc-900 ${
          isSidebarCollapsed ? "w-0" : "w-64"
        }`}
      >
        {/* Header */}
        <div className="p-3 flex items-center justify-between">
          <span className="text-xl font-bold text-zinc-900 dark:text-white px-1 tracking-tight">ChatFlow</span>
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
        <div className="px-2 pb-2 mt-2">
          <button
            onClick={handleNewSession}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-sm text-zinc-900 dark:text-zinc-100 cursor-pointer"
            title="New Conversation"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>New chat</span>
          </button>
        </div>

        {/* Session list with tree structure */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 pb-2 pt-2 text-xs font-medium text-zinc-400 dark:text-zinc-500">
            Your chats
          </div>
          <div className="px-2">
            <div className="space-y-0.5">
              {[...sessions].sort((a, b) => b.updatedAt - a.updatedAt).map((session) => {
                const isActive = session.id === activeSessionId;
                const rootNode = session.nodes.find(n => n.id === session.rootNodeId);
                
                // Use session title directly
                const title = session.title;
                
                return (
                  <div key={session.id} className="space-y-1">
                    {/* Session header */}
                    <div
                      className={`group flex items-center gap-2 px-3 py-2 rounded-lg transition-colors cursor-pointer text-sm ${
                        isActive
                          ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                          : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white"
                      }`}
                      onClick={() => switchSession(session.id)}
                    >
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        {/* Only show icon if we want to emulate generic file icons, but GPT just lists text mostly. 
                            Let's keep it simple: text only, maybe small dot for active? 
                            The user asked for "like GPT", GPT lists are just text. 
                            I'll remove the folder icon to be cleaner. */}
                        <div className="truncate">{title}</div>
                      </div>
                      
                      <button
                        onClick={(e) => handleDeleteSession(session.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-all"
                        title="Delete conversation"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    
                    {/* Show tree structure only for active session, slightly indented */}
                    {isActive && rootNode && (
                      <div className="ml-1 mt-1">
                        <TreeNodeComponent
                          session={session}
                          activeNodeId={activeNodeId}
                          onNodeClick={setActiveNode}
                          onNodeDelete={handleDeleteNode}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Main content area - fullscreen for active node */}
      <div className="flex-1 h-full bg-white dark:bg-zinc-900 shadow-xl relative">
        <FocusView nodeId={activeNodeId} isSidebarCollapsed={isSidebarCollapsed} />
      </div>
    </div>
  );
}
