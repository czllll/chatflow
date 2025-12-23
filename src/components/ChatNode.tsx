"use client";

import { useState, useCallback, useRef, useEffect, KeyboardEvent, FormEvent, useMemo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { useChatFlowStore, type ChatNodeData, type Message, type BranchHighlight } from "@/store";
import BranchButton from "./BranchButton";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// Preprocess LaTeX: convert various LaTeX formats to $ and $$ for KaTeX compatibility
function preprocessLaTeX(content: string): string {
  let processed = content;
  
  // Replace \begin{equation*}...\end{equation*} with $$ ... $$
  processed = processed.replace(/\\begin\{equation\*?\}([\s\S]+?)\\end\{equation\*?\}/g, (_, p1) => `$$${p1.trim()}$$`);
  
  // Replace \begin{align}...\end{align} with $$ ... $$
  processed = processed.replace(/\\begin\{align\*?\}([\s\S]+?)\\end\{align\*?\}/g, (_, p1) => `$$\\begin{aligned}${p1}\\end{aligned}$$`);
  
  // Replace \begin{gather}...\end{gather} with $$ ... $$
  processed = processed.replace(/\\begin\{gather\*?\}([\s\S]+?)\\end\{gather\*?\}/g, (_, p1) => `$$\\begin{gathered}${p1}\\end{gathered}$$`);
  
  // Replace \begin{matrix}...\end{matrix} variants
  processed = processed.replace(/\\begin\{(b?p?v?B?V?matrix)\}([\s\S]+?)\\end\{\1\}/g, (_, type, p1) => `$$\\begin{${type}}${p1}\\end{${type}}$$`);
  
  // Replace \[ ... \] with $$ ... $$ (display math)
  processed = processed.replace(/\\\[([\s\S]+?)\\\]/g, (_, p1) => `$$${p1.trim()}$$`);
  
  // Replace \( ... \) with $ ... $ (inline math)
  processed = processed.replace(/\\\((.+?)\\\)/g, (_, p1) => `$${p1}$`);
  
  return processed;
}

type ChatNodeType = Node<ChatNodeData, "chatNode">;
function HighlightedContent({ 
  content, 
  highlights 
}: { 
  content: string; 
  highlights: BranchHighlight[];
}) {
  if (!highlights || highlights.length === 0) {
    return <>{content}</>;
  }

  // Find all highlight positions
  const parts: { text: string; isHighlight: boolean; branchId?: string }[] = [];
  let lastIndex = 0;

  // Sort highlights by their position in content
  const sortedHighlights = highlights
    .map((h) => ({ ...h, index: content.indexOf(h.text) }))
    .filter((h) => h.index !== -1)
    .sort((a, b) => a.index - b.index);

  for (const highlight of sortedHighlights) {
    const index = content.indexOf(highlight.text, lastIndex);
    if (index === -1) continue;

    // Add text before highlight
    if (index > lastIndex) {
      parts.push({ text: content.slice(lastIndex, index), isHighlight: false });
    }

    // Add highlighted text
    parts.push({ 
      text: highlight.text, 
      isHighlight: true, 
      branchId: highlight.branchNodeId 
    });

    lastIndex = index + highlight.text.length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push({ text: content.slice(lastIndex), isHighlight: false });
  }

  return (
    <>
      {parts.map((part, i) =>
        part.isHighlight ? (
          <span
            key={i}
            className="bg-amber-200 dark:bg-amber-800/50 text-amber-900 dark:text-amber-100 
              px-0.5 rounded border-b-2 border-amber-400 dark:border-amber-600
              cursor-pointer hover:bg-amber-300 dark:hover:bg-amber-700/50 transition-colors"
            title={`Branch: ${part.branchId}`}
          >
            {part.text}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

export default function ChatNode({ id, data }: NodeProps<ChatNodeType>) {
  const {
    apiKey: legacyApiKey,
    baseUrl: legacyBaseUrl,
    modelId: legacyModelId,
    activeProviderId,
    providerConfigs,
    updateNodeData,
    removeNode,
    createBranch,
    setActiveNode,
    setViewMode,
  } = useChatFlowStore();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [floatingPos, setFloatingPos] = useState<{ x: number; y: number } | null>(null);
  const [showBranchButton, setShowBranchButton] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const nodeData = data as ChatNodeData;

  // Determine current configuration
  const currentConfig = providerConfigs[activeProviderId] || {
    apiKey: legacyApiKey,
    baseUrl: legacyBaseUrl,
    selectedModelId: legacyModelId,
  };

  const currentApiKey = currentConfig.apiKey || legacyApiKey;
  const currentBaseUrl = currentConfig.baseUrl || legacyBaseUrl;
  const currentModelId = currentConfig.selectedModelId || legacyModelId;

  // Handle text selection for branching
  const handleSelectionChange = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.toString().trim().length === 0) {
      return;
    }

    // Check if selection is within this node's messages area
    const messagesArea = messagesAreaRef.current;
    if (!messagesArea) return;

    const anchorNode = selection.anchorNode;
    if (!anchorNode || !messagesArea.contains(anchorNode)) return;

    // Find which message contains the selection
    let messageElement = anchorNode.parentElement;
    while (messageElement && !messageElement.hasAttribute('data-message-id')) {
      messageElement = messageElement.parentElement;
    }
    const messageId = messageElement?.getAttribute('data-message-id') || null;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const nodeRect = nodeRef.current?.getBoundingClientRect();
    
    if (nodeRect && rect.width > 0) {
      setFloatingPos({
        x: rect.left - nodeRect.left + rect.width / 2,
        y: rect.top - nodeRect.top - 10,
      });
      setSelectedText(selection.toString().trim());
      setSelectedMessageId(messageId);
      setShowBranchButton(true);
    }
  }, []);

  // Listen for selection changes
  useEffect(() => {
    const handleMouseUp = () => {
      setTimeout(handleSelectionChange, 10);
    };

    const messagesArea = messagesAreaRef.current;
    if (messagesArea) {
      messagesArea.addEventListener("mouseup", handleMouseUp);
      return () => messagesArea.removeEventListener("mouseup", handleMouseUp);
    }
  }, [handleSelectionChange]);

  // Hide branch button when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-branch-button]')) return;
      
      if (!messagesAreaRef.current?.contains(target)) {
        setShowBranchButton(false);
        setFloatingPos(null);
        setSelectedText("");
        setSelectedMessageId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [nodeData.messages]);

  // Handle branch button click
  const handleBranchClick = useCallback(() => {
    if (selectedText) {
      createBranch(id, selectedText, selectedMessageId || undefined);
    }
    setShowBranchButton(false);
    setFloatingPos(null);
    setSelectedText("");
    setSelectedMessageId(null);
    window.getSelection()?.removeAllRanges();
  }, [createBranch, id, selectedText, selectedMessageId]);

  // Handle branch button close
  const handleBranchClose = useCallback(() => {
    setShowBranchButton(false);
    setFloatingPos(null);
    setSelectedText("");
    setSelectedMessageId(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  // Send AI request function (reusable)
  const sendAiRequest = useCallback(
    async (messagesToSend: Message[]) => {
      if (!currentApiKey || isLoading) return;

      setIsLoading(true);

      const contextMessages = nodeData.reference
        ? [
            {
              role: "system" as const,
              content: `The user is asking about this specific text excerpt: "${nodeData.reference}". Answer their question about this text.`,
            },
            ...messagesToSend.map((m) => ({ role: m.role, content: m.content })),
          ]
        : messagesToSend.map((m) => ({ role: m.role, content: m.content }));

      try {
        abortControllerRef.current = new AbortController();

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": currentApiKey,
            "x-base-url": currentBaseUrl,
            "x-model": currentModelId,
          },
          body: JSON.stringify({ messages: contextMessages }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || `HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader available");

        const decoder = new TextDecoder();
        let assistantContent = "";
        const assistantMessageId = (Date.now() + 1).toString();

        updateNodeData(id, {
          messages: [
            ...messagesToSend,
            { id: assistantMessageId, role: "assistant", content: "" },
          ],
        });

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          assistantContent += chunk;
          updateNodeData(id, {
            messages: [
              ...messagesToSend,
              {
                id: assistantMessageId,
                role: "assistant",
                content: assistantContent,
              },
            ],
          });
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("Chat error:", error);
          updateNodeData(id, {
            messages: [
              ...messagesToSend,
              {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: `Error: ${(error as Error).message}`,
              },
            ],
          });
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [currentApiKey, currentBaseUrl, currentModelId, nodeData.reference, updateNodeData, id, isLoading]
  );

  // Auto-send AI request for new branches with pendingAiRequest flag
  useEffect(() => {
    if (nodeData.pendingAiRequest && nodeData.messages.length > 0 && currentApiKey && !isLoading) {
      // Clear the flag and send request
      updateNodeData(id, { pendingAiRequest: false });
      sendAiRequest(nodeData.messages);
    }
  }, [nodeData.pendingAiRequest, nodeData.messages, currentApiKey, isLoading, updateNodeData, id, sendAiRequest]);

  // Handle form submit
  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!input.trim() || !currentApiKey || isLoading) return;

      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: input.trim(),
      };

      const newMessages = [...nodeData.messages, userMessage];
      updateNodeData(id, { messages: newMessages });
      setInput("");
      
      await sendAiRequest(newMessages);
    },
    [input, currentApiKey, isLoading, nodeData.messages, updateNodeData, id, sendAiRequest]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e as unknown as FormEvent);
    }
  };

  return (
    <div
      ref={nodeRef}
      className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-700 w-[420px] min-h-[240px] max-h-[520px] flex flex-col"
    >
      <Handle type="target" position={Position.Left} className="!bg-amber-500" />
      <Handle type="source" position={Position.Right} className="!bg-amber-500" />

      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-100 dark:border-zinc-800">
        <span className="text-xs text-zinc-400 font-mono">
          {id === "root" ? "Main Thread" : "Branch"}
        </span>
        <div className="flex items-center gap-1">
          {/* Expand to Focus View button */}
          <button
            onClick={() => {
              setActiveNode(id);
              setViewMode("focus");
            }}
            className="p-1 text-zinc-400 hover:text-amber-500 transition-colors rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title="Expand to Focus View"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
          {/* Delete button for non-root nodes */}
          {id !== "root" && (
            <button
              onClick={() => removeNode(id)}
              className="p-1 text-zinc-400 hover:text-red-500 transition-colors rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title="Delete branch"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {nodeData.reference && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800">
          <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
            <span className="font-medium">Discussing:</span>
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 line-clamp-2 italic">
            &quot;{nodeData.reference}&quot;
          </p>
        </div>
      )}

      <div
        ref={messagesAreaRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3 nodrag nowheel select-text"
        style={{ userSelect: "text", cursor: "text" }}
      >
        {nodeData.messages.length === 0 && !nodeData.reference && (
          <p className="text-zinc-400 text-sm text-center py-8">
            Start a conversation...
          </p>
        )}
        {nodeData.messages.map((message) => (
          <div
            key={message.id}
            data-message-id={message.id}
            className={`text-sm ${
              message.role === "user"
                ? "text-zinc-800 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3 py-2 whitespace-pre-wrap"
                : "text-zinc-700 dark:text-zinc-300 prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-pre:my-2 prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-800 prose-code:text-amber-600 dark:prose-code:text-amber-400 prose-code:before:content-none prose-code:after:content-none"
            }`}
          >
            {message.role === "user" ? (
              message.content
            ) : (
              <ReactMarkdown 
                remarkPlugins={[remarkGfm, remarkMath]} 
                rehypePlugins={[rehypeKatex]}
              >
                {preprocessLaTeX(message.content)}
              </ReactMarkdown>
            )}
          </div>
        ))}
        {isLoading && nodeData.messages[nodeData.messages.length - 1]?.role !== "assistant" && (
          <div className="flex items-center gap-1 text-zinc-400">
            <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" />
            <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce [animation-delay:0.1s]" />
            <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce [animation-delay:0.2s]" />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={onSubmit} className="p-3 border-t border-zinc-100 dark:border-zinc-800">
        <div className="flex items-end gap-2 px-2 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={currentApiKey ? "Ask anything..." : "Set API key first"}
            disabled={!currentApiKey || isLoading}
            className="flex-1 resize-none bg-transparent px-1 py-1 text-sm focus:outline-none disabled:opacity-50 nodrag min-h-[20px] max-h-[80px]"
            rows={1}
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          {isLoading ? (
            <button
              type="button"
              onClick={() => abortControllerRef.current?.abort()}
              className="p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors shrink-0"
              title="Stop generating"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!currentApiKey || !input.trim()}
              className="p-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </button>
          )}
        </div>
      </form>

      {showBranchButton && floatingPos && selectedText && (
        <BranchButton
          parentId={id}
          selectedText={selectedText}
          position={floatingPos}
          onClose={handleBranchClose}
        />
      )}
    </div>
  );
}
