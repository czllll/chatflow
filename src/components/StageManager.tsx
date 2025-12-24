"use client";

import { useCallback, useState, useEffect } from "react";
import { useChatFlowStore, getMessageText } from "@/store";
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
        <div className="px-2 pb-3 space-y-1">
          <button
            onClick={handleNewSession}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-sm text-zinc-700 dark:text-zinc-300"
            title="New Conversation"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>New chat</span>
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-zinc-200 dark:bg-zinc-800 mx-2" />

        {/* Session list with tree structure */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-2 py-2">
            <h3 className="px-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
              Conversations
            </h3>
            <div className="space-y-3">
              {[...sessions].sort((a, b) => b.updatedAt - a.updatedAt).map((session) => {
                const isActive = session.id === activeSessionId;
                const rootNode = session.nodes.find(n => n.id === session.rootNodeId);
                
                // Get conversation title from root node
                const getConversationTitle = () => {
                  if (!rootNode) return "New Chat";
                  const firstUserMsg = rootNode.data.messages.find(m => m.role === "user");
                  if (firstUserMsg) {
                    const content = getMessageText(firstUserMsg.content);
                    return content.length > 40 ? content.slice(0, 40) + "..." : content;
                  }
                  return "New Chat";
                };
                
                const title = getConversationTitle();
                
                return (
                  <div key={session.id} className="space-y-1">
                    {/* Session header */}
                    <div
                      className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                        isActive
                          ? "bg-amber-50 dark:bg-amber-900/20"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      }`}
                    >
                      <div 
                        onClick={() => switchSession(session.id)}
                        className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                      >
                        <svg className="w-4 h-4 shrink-0 text-zinc-600 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate text-zinc-900 dark:text-white">{title}</div>
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleDeleteSession(session.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-opacity"
                        title="Delete conversation"
                      >
                        <svg className="w-3.5 h-3.5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    
                    {/* Show tree structure only for active session */}
                    {isActive && rootNode && (
                      <div className="ml-2">
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
