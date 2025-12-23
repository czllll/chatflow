"use client";

import { useState, useCallback, useRef, useEffect, KeyboardEvent, FormEvent } from "react";
import { useChatFlowStore, type Message } from "@/store";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import BranchButton from "./BranchButton";
import ModelSelector from "./ModelSelector";
import SmoothCaret from "./SmoothCaret";

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

interface FocusViewProps {
  nodeId: string;
}

export default function FocusView({ nodeId }: FocusViewProps) {
  const {
    apiKey: legacyApiKey,
    baseUrl: legacyBaseUrl,
    modelId: legacyModelId,
    activeProviderId,
    providerConfigs,
    nodes,
    updateNodeData,
    setActiveNode,
    setViewMode,
  } = useChatFlowStore();

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [floatingPos, setFloatingPos] = useState<{ x: number; y: number } | null>(null);
  const [showBranchButton, setShowBranchButton] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isTextareaFocused, setIsTextareaFocused] = useState(false);

  const node = nodes.find((n) => n.id === nodeId);
  const nodeData = node?.data;
  const messages = nodeData?.messages || [];

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

    const messagesArea = messagesAreaRef.current;
    if (!messagesArea) return;

    const anchorNode = selection.anchorNode;
    if (!anchorNode || !messagesArea.contains(anchorNode)) return;

    let messageElement = anchorNode.parentElement;
    while (messageElement && !messageElement.hasAttribute('data-message-id')) {
      messageElement = messageElement.parentElement;
    }
    const messageId = messageElement?.getAttribute('data-message-id') || null;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    
    if (containerRect && rect.width > 0) {
      setFloatingPos({
        x: rect.left - containerRect.left + rect.width / 2,
        y: rect.top - containerRect.top - 10,
      });
      setSelectedText(selection.toString().trim());
      setSelectedMessageId(messageId);
      setShowBranchButton(true);
    }
  }, []);

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

  const handleBranchClose = useCallback(() => {
    setShowBranchButton(false);
    setFloatingPos(null);
    setSelectedText("");
    setSelectedMessageId(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Extracted AI request logic for reuse
  const sendAiRequest = useCallback(
    async (currentMessages: Message[]) => {
      if (!currentApiKey || isLoading || currentMessages.length === 0) return;

      setIsLoading(true);

      const contextMessages = nodeData?.reference
        ? [
            {
              role: "system" as const,
              content: `The user is asking about this specific text excerpt: "${nodeData.reference}". Answer their question about this text.`,
            },
            ...currentMessages.map((m) => ({ role: m.role, content: m.content })),
          ]
        : currentMessages.map((m) => ({ role: m.role, content: m.content }));

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
        const assistantMessageId = Date.now().toString() + "-ai";

        updateNodeData(nodeId, {
          messages: [
            ...currentMessages,
            { id: assistantMessageId, role: "assistant", content: "" },
          ],
        });

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          assistantContent += chunk;
          updateNodeData(nodeId, {
            messages: [
              ...currentMessages,
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
          updateNodeData(nodeId, {
            messages: [
              ...currentMessages,
              {
                id: Date.now().toString() + "-error",
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
    [currentApiKey, currentBaseUrl, currentModelId, isLoading, nodeData?.reference, updateNodeData, nodeId]
  );

  // Auto-send AI request when pendingAiRequest is set (for new branches)
  useEffect(() => {
    if (nodeData?.pendingAiRequest && messages.length > 0 && currentApiKey && !isLoading) {
      // Clear the pending flag first
      updateNodeData(nodeId, { pendingAiRequest: false });
      // Then send the request
      sendAiRequest(messages);
    }
  }, [nodeData?.pendingAiRequest, messages, currentApiKey, isLoading, updateNodeData, nodeId, sendAiRequest]);

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!input.trim() || !currentApiKey || isLoading) return;

      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: input.trim(),
      };

      const newMessages = [...messages, userMessage];
      updateNodeData(nodeId, { messages: newMessages });
      setInput("");
      
      await sendAiRequest(newMessages);
    },
    [input, currentApiKey, isLoading, messages, updateNodeData, nodeId, sendAiRequest]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e as unknown as FormEvent);
    }
  };

  return (
    <div 
      ref={containerRef} 
      className="flex flex-col h-full bg-white dark:bg-zinc-900 relative"
    >
      {/* Top bar with model selector */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <ModelSelector />
        <div className="flex-1" />
      </div>

      {/* Reference indicator for branches */}
      {nodeData?.reference && (
        <div className="px-6 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800">
          <div className="max-w-3xl mx-auto flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="text-amber-700 dark:text-amber-300 italic line-clamp-1">
              {nodeData.reference}
            </span>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div
        ref={messagesAreaRef}
        className="flex-1 overflow-y-auto px-4 py-6 min-h-0"
        style={{ userSelect: "text" }}
      >
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 && !nodeData?.reference && (
            <div className="flex flex-col items-center justify-center h-full min-h-96">
              <h1 className="text-2xl font-medium text-zinc-900 dark:text-zinc-100">
                What can I help you with?
              </h1>
            </div>
          )}
          
          {messages.map((message) => (
            <div
              key={message.id}
              data-message-id={message.id}
              className={`${
                message.role === "user"
                  ? "flex justify-end"
                  : ""
              }`}
            >
              {message.role === "user" ? (
                <div className="max-w-[80%] px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-2xl text-zinc-900 dark:text-zinc-100">
                  {message.content}
                </div>
              ) : (
                <div className="prose prose-zinc dark:prose-invert max-w-none prose-p:my-1 prose-pre:my-2 prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-800 prose-code:text-amber-600 dark:prose-code:text-amber-400 prose-code:before:content-none prose-code:after:content-none text-zinc-900 dark:text-zinc-100">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm, remarkMath]} 
                    rehypePlugins={[rehypeKatex]}
                  >
                    {preprocessLaTeX(message.content)}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          ))}
          
          {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex items-center gap-1.5 text-zinc-400">
              <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce [animation-delay:0.1s]" />
              <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce [animation-delay:0.2s]" />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area - fixed at bottom */}
      <div className="shrink-0 bg-white dark:bg-zinc-900 px-4 pb-6 pt-4">
        <form onSubmit={onSubmit} className="max-w-4xl mx-auto">
          <div className="relative flex items-center gap-3 px-4 py-3 rounded-3xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 shadow-sm focus-within:border-zinc-300 dark:focus-within:border-zinc-600 transition-colors">
            {/* Custom smooth caret overlay */}
            <SmoothCaret textareaRef={textareaRef} isActive={isTextareaFocused} />
            
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsTextareaFocused(true)}
              onBlur={() => setIsTextareaFocused(false)}
              placeholder="Message ChatFlow"
              disabled={!currentApiKey || isLoading}
              className="flex-1 resize-none bg-transparent text-[15px] leading-6 focus:outline-none disabled:opacity-50 max-h-48 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
              rows={1}
              style={{ 
                fieldSizing: "content",
                caretColor: "transparent"
              } as React.CSSProperties}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                title="Voice input"
              >
                <svg className="w-5 h-5 text-zinc-600 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>
              {isLoading ? (
                <button
                  type="button"
                  onClick={() => abortControllerRef.current?.abort()}
                  className="p-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-full transition-colors shrink-0"
                  title="Stop"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!currentApiKey || !input.trim()}
                  className="p-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-full disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* Branch button */}
      {showBranchButton && floatingPos && selectedText && (
        <BranchButton
          parentId={nodeId}
          selectedText={selectedText}
          position={floatingPos}
          onClose={handleBranchClose}
        />
      )}
    </div>
  );
}
