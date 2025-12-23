"use client";

import { useChatFlowStore } from "@/store";

interface NodeThumbnailProps {
  nodeId: string;
  isActive: boolean;
  onClick: () => void;
}

export default function NodeThumbnail({ nodeId, isActive, onClick }: NodeThumbnailProps) {
  const { nodes, removeNode } = useChatFlowStore();
  
  const node = nodes.find((n) => n.id === nodeId);
  const nodeData = node?.data;
  const messages = nodeData?.messages || [];
  const reference = nodeData?.reference;
  
  // Get preview content
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === "assistant");
  
  const previewText = reference 
    ? `📌 ${reference.slice(0, 50)}...`
    : lastUserMessage?.content?.slice(0, 50) || "New conversation";

  return (
    <div
      onClick={onClick}
      className={`
        group relative px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200
        ${isActive 
          ? "bg-zinc-100 dark:bg-zinc-800" 
          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
        }
      `}
    >
      {/* Delete button for non-root nodes */}
      {nodeId !== "root" && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeNode(nodeId);
          }}
          className="absolute top-2 right-2 p-1 text-zinc-400 hover:text-red-500 transition-colors rounded opacity-0 group-hover:opacity-100"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* Preview text */}
      <p className="text-sm text-zinc-700 dark:text-zinc-300 line-clamp-1 pr-6">
        {previewText}
      </p>
    </div>
  );
}
