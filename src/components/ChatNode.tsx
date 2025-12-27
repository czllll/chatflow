"use client";

import { useState, useCallback, useRef, useEffect, KeyboardEvent, FormEvent } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { useChatFlowStore, type ChatNodeData, type Message, getMessageText } from "@/store";
import BranchButton from "./BranchButton";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

import { preprocessLaTeX } from "@/utils/latex";
import Image from "next/image";


type ChatNodeType = Node<ChatNodeData, "chatNode">;

export default function ChatNode({ id, data }: NodeProps<ChatNodeType>) {
  const {
    apiKey: legacyApiKey,
    baseUrl: legacyBaseUrl,
    modelId: legacyModelId,
    activeProviderId,
    providerConfigs,
    updateNodeData,
    removeNode,
    setActiveNode,
    setViewMode,
    sessions,
    activeSessionId,
  } = useChatFlowStore();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [floatingPos, setFloatingPos] = useState<{ x: number; y: number } | null>(null);
  const [showBranchButton, setShowBranchButton] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const nodeData = data as ChatNodeData;
  const activeSession = sessions.find(s => s.id === activeSessionId);
  const isRoot = id === activeSession?.rootNodeId;

  // Determine current configuration
  const currentConfig = providerConfigs[activeProviderId] || {
    apiKey: legacyApiKey,
    baseUrl: legacyBaseUrl,
    selectedModelId: legacyModelId,
  };

  const currentApiKey = currentConfig.apiKey || legacyApiKey;
  const currentBaseUrl = currentConfig.baseUrl || legacyBaseUrl;
  const currentModelId = currentConfig.selectedModelId || legacyModelId;
  
  // Gemini and Antigravity use OAuth refresh token (handled server-side), not API key
  const isOAuthProvider = activeProviderId === 'gemini' || activeProviderId === 'antigravity';
  const isApiKeyConfigured = !!currentApiKey || isOAuthProvider;

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
    // const messageId = messageElement?.getAttribute('data-message-id') || null;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const nodeRect = nodeRef.current?.getBoundingClientRect();
    
    if (nodeRect && rect.width > 0) {
      setFloatingPos({
        x: rect.left - nodeRect.left + rect.width / 2,
        y: rect.top - nodeRect.top - 10,
      });
      setSelectedText(selection.toString().trim());
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
  // const handleBranchClick = useCallback(() => {
  //   if (selectedText) {
  //     createBranch(id, selectedText, selectedMessageId || undefined);
  //   }
  //   setShowBranchButton(false);
  //   setFloatingPos(null);
  //   setSelectedText("");
  //   setSelectedMessageId(null);
  //   window.getSelection()?.removeAllRanges();
  // }, [createBranch, id, selectedText, selectedMessageId]);

  // Handle branch button close
  const handleBranchClose = useCallback(() => {
    setShowBranchButton(false);
    setFloatingPos(null);
    setSelectedText("");
    window.getSelection()?.removeAllRanges();
  }, []);

  // Send AI request function (reusable)
  const sendAiRequest = useCallback(
    async (messagesToSend: Message[]) => {
      if (!isApiKeyConfigured || isLoading) return;

      setIsLoading(true);

      const contextMessages = nodeData.reference
        ? [
            {
              role: "system" as const,
              content: `The user is asking about this specific text excerpt: "${nodeData.reference}". Answer their question about this text.`,
            },
            ...messagesToSend.map((m) => ({ role: m.role, content: m.content })),
          ]
        : messagesToSend.map((m) => {
            if (typeof m.content === "string") return { role: m.role, content: m.content };
            return { role: m.role, content: m.content };
          });

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
    [isApiKeyConfigured, currentApiKey, currentBaseUrl, currentModelId, nodeData.reference, updateNodeData, id, isLoading]
  );

  // Auto-send AI request for new branches with pendingAiRequest flag
  useEffect(() => {
    if (nodeData.pendingAiRequest && nodeData.messages.length > 0 && isApiKeyConfigured && !isLoading) {
      // Clear the flag and send request
      updateNodeData(id, { pendingAiRequest: false });
      sendAiRequest(nodeData.messages);
    }
  }, [nodeData.pendingAiRequest, nodeData.messages, isApiKeyConfigured, isLoading, updateNodeData, id, sendAiRequest]);

  // Handle form submit
  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!input.trim() || !isApiKeyConfigured || isLoading) return;

      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: input.trim(), // ChatNode input is still text-only for now, can be upgraded later if needed
      };

      const newMessages = [...nodeData.messages, userMessage];
      updateNodeData(id, { messages: newMessages });
      setInput("");
      
      await sendAiRequest(newMessages);
    },
    [input, isApiKeyConfigured, isLoading, nodeData.messages, updateNodeData, id, sendAiRequest]
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
          {isRoot ? "Main Thread" : "Branch"}
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
          {!isRoot && (
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
              typeof message.content !== "string" && Array.isArray(message.content) ? (
                <div className="space-y-2">
                   {message.content.map((part, i) => {
                     if (part.type === "image_url") {
                       return (
                         <Image 
                           key={i} 
                           src={part.image_url.url} 
                           alt="User uploaded" 
                           width={500}
                           height={300}
                           className="max-w-full rounded-lg max-h-64 object-contain w-auto h-auto"
                           unoptimized 
                         />
                       );
                     }
                     return <div key={i}>{part.text}</div>;
                   })}
                </div>
              ) : (
                message.content
              )
            ) : (
              <ReactMarkdown 
                remarkPlugins={[remarkGfm, remarkMath]} 
                rehypePlugins={[rehypeKatex]}
              >
                {preprocessLaTeX(getMessageText(message.content))}
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
            placeholder={isApiKeyConfigured ? "Ask anything..." : "Set API key first"}
            disabled={!isApiKeyConfigured || isLoading}
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
              disabled={!isApiKeyConfigured || !input.trim()}
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
