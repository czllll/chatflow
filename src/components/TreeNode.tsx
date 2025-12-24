"use client";

import { useState } from "react";
import { Node } from "@xyflow/react";
import { ChatNodeData, getMessageText } from "@/store";
import { TreeNodeData } from "@/utils/treeBuilder";

interface TreeNodeProps {
  node: Node<ChatNodeData>;
  childNodes?: TreeNodeData[];
  depth: number;
  isActive: boolean;
  onClick: (nodeId: string) => void;
  onDelete?: (nodeId: string, e: React.MouseEvent) => void;
  isRoot?: boolean;
}

export default function TreeNode({
  node,
  childNodes = [],
  depth,
  isActive,
  onClick,
  onDelete,
  isRoot = false,
}: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = childNodes.length > 0;

  // Get node label
  const getNodeLabel = () => {
    if (isRoot) {
      return "Main conversation";
    }
    
    // Use reference text if available (from branch creation)
    if (node.data.reference) {
      const ref = node.data.reference;
      return ref.length > 30 ? ref.slice(0, 30) + "..." : ref;
    }
    
    // Otherwise use first user message
    const firstUserMsg = node.data.messages.find(m => m.role === "user");
    if (firstUserMsg) {
      const content = getMessageText(firstUserMsg.content);
      return content.length > 30 ? content.slice(0, 30) + "..." : content;
    }
    
    return "Branch";
  };

  const label = getNodeLabel();
  const indentPx = depth * 16;

  return (
    <div>
      {/* Current node */}
      <div
        className={`group flex items-center gap-1 px-2 py-1.5 rounded-md transition-colors cursor-pointer ${
          isActive
            ? "bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-100"
            : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
        }`}
        style={{ paddingLeft: `${8 + indentPx}px` }}
      >
        {/* Expand/collapse button */}
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="shrink-0 p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
          >
            <svg
              className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* Spacer for nodes without children */}
        {!hasChildren && <div className="w-4 shrink-0" />}

        {/* Node icon */}
        <div className="shrink-0" onClick={() => onClick(node.id)}>
          {isRoot ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          )}
        </div>

        {/* Node label */}
        <div className="flex-1 min-w-0" onClick={() => onClick(node.id)}>
          <div className="text-sm truncate">{label}</div>
        </div>

        {/* Delete button (not for root) */}
        {!isRoot && onDelete && (
          <button
            onClick={(e) => onDelete(node.id, e)}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-opacity"
            title="Delete branch"
          >
            <svg className="w-3 h-3 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>

      {/* Children nodes */}
      {isExpanded && hasChildren && (
        <div>
          {childNodes.map((child) => (
            <TreeNode
              key={child.node.id}
              node={child.node}
              childNodes={child.children}
              depth={depth + 1}
              isActive={child.isActive}
              onClick={onClick}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
