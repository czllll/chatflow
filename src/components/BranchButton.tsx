"use client";

import { useState, useRef, useEffect } from "react";
import { useChatFlowStore } from "@/store";

interface BranchButtonProps {
  parentId: string;
  selectedText: string;
  position: { x: number; y: number };
  onClose: () => void;
}

export default function BranchButton({
  parentId,
  selectedText,
  position,
  onClose,
}: BranchButtonProps) {
  const { createBranch } = useChatFlowStore();
  const [showInput, setShowInput] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Focus input when shown
  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showInput]);

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setShowInput(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (prompt.trim()) {
      createBranch(parentId, selectedText, undefined, prompt.trim());
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Don't submit if user is using IME (e.g., Chinese, Japanese input)
    if (e.key === "Enter" && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSubmit(e);
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  if (showInput) {
    return (
      <div
        data-branch-button
        className="absolute z-50 w-72 bg-white dark:bg-zinc-800 rounded-xl shadow-2xl border border-amber-200 dark:border-amber-700 overflow-hidden"
        style={{
          left: position.x,
          top: position.y,
          transform: "translate(-50%, -100%)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header showing selected text */}
        <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-100 dark:border-amber-800">
          <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <span>📌</span>
            <span className="font-medium">About:</span>
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 line-clamp-2 italic">
            &quot;{selectedText.length > 50 ? selectedText.slice(0, 50) + "..." : selectedText}&quot;
          </p>
        </div>
        
        {/* Input area */}
        <form onSubmit={handleSubmit} className="p-2">
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            placeholder="Ask about this..."
            className="w-full resize-none rounded-lg border border-zinc-200 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 nodrag"
            rows={2}
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!prompt.trim()}
              className="px-3 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Create Branch
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <button
      data-branch-button
      onClick={handleButtonClick}
      onMouseDown={(e) => e.stopPropagation()}
      className="absolute z-50 flex items-center gap-1.5 px-3 py-1.5 
        bg-amber-100 hover:bg-amber-200 
        dark:bg-amber-900/80 dark:hover:bg-amber-800
        text-amber-900 dark:text-amber-100
        text-xs font-medium rounded-full 
        shadow-lg border border-amber-200 dark:border-amber-700
        transition-all transform hover:scale-105 
        animate-in fade-in zoom-in duration-150
        cursor-pointer"
      style={{
        left: position.x,
        top: position.y,
        transform: "translate(-50%, -100%)",
      }}
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
      Ask ChatFlow
    </button>
  );
}
