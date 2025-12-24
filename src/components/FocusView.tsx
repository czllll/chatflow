"use client";

import { useState, useCallback, useRef, useEffect, KeyboardEvent, FormEvent, useMemo } from "react";
import { useChatFlowStore, type Message, type MessageContent, getMessageText } from "@/store";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import BranchButton from "./BranchButton";
import ModelSelector from "./ModelSelector";
import SmoothCaret from "./SmoothCaret";
import Image from "next/image";

import { preprocessLaTeX } from "@/utils/latex";


interface FocusViewProps {
  nodeId: string;
  isSidebarCollapsed?: boolean;
}

export default function FocusView({ nodeId, isSidebarCollapsed = false }: FocusViewProps) {
  const {
    apiKey: legacyApiKey,
    baseUrl: legacyBaseUrl,
    modelId: legacyModelId,
    activeProviderId,
    providerConfigs,
    nodes,
    updateNodeData,
    setViewMode,
  } = useChatFlowStore();

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [floatingPos, setFloatingPos] = useState<{ x: number; y: number } | null>(null);
  const [showBranchButton, setShowBranchButton] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isTextareaFocused, setIsTextareaFocused] = useState(false);

  const node = nodes.find((n) => n.id === nodeId);
  const nodeData = node?.data;
  const messages = useMemo(() => nodeData?.messages || [], [nodeData?.messages]);

  // Determine current configuration
  const currentConfig = providerConfigs[activeProviderId] || {
    apiKey: legacyApiKey,
    baseUrl: legacyBaseUrl,
    selectedModelId: legacyModelId,
  };

  const currentApiKey = currentConfig.apiKey || legacyApiKey;
  const currentBaseUrl = currentConfig.baseUrl || legacyBaseUrl;
  const currentModelId = currentConfig.selectedModelId || legacyModelId;
  const isMultimodalModel = currentConfig.models?.find(m => m.id === currentModelId)?.isMultimodal;

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
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleBranchClose = useCallback(() => {
    setShowBranchButton(false);
    setFloatingPos(null);
    setSelectedText("");
    window.getSelection()?.removeAllRanges();
  }, []);

  // Image file handling
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.type.startsWith('image/')) {
        console.error("Please upload an image file");
        return;
      }
      setIsProcessingImage(true);
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
        setIsProcessingImage(false);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const clearSelectedImage = useCallback(() => {
    setSelectedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (!isMultimodalModel) return;
    
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          setIsProcessingImage(true);
          const reader = new FileReader();
          reader.onloadend = () => {
            setSelectedImage(reader.result as string);
            setIsProcessingImage(false);
          };
          reader.readAsDataURL(file);
        }
        break;
      }
    }
  }, [isMultimodalModel]);

  // Auto-scroll to bottom - debounced to prevent jumping during streaming
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [messages.length]);

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
      if ((!input.trim() && !selectedImage) || !currentApiKey || isLoading) return;

      const content: MessageContent = selectedImage 
        ? [
            { type: "text", text: input.trim() },
            { type: "image_url", image_url: { url: selectedImage } }
          ]
        : input.trim();

      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content,
      };

      const newMessages = [...messages, userMessage];
      updateNodeData(nodeId, { messages: newMessages });
      setInput("");
      setSelectedImage(null);
      
      // Reset textarea cursor position and trigger update
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.setSelectionRange(0, 0);
          // Trigger input event to update custom caret position
          textareaRef.current.dispatchEvent(new Event('input', { bubbles: true }));
          textareaRef.current.dispatchEvent(new Event('click', { bubbles: true }));
        }
      }, 0);
      
      await sendAiRequest(newMessages);
    },
    [input, selectedImage, currentApiKey, isLoading, messages, updateNodeData, nodeId, sendAiRequest]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Don't submit if user is using IME (e.g., Chinese, Japanese input)
    if (e.key === "Enter" && !e.shiftKey && !isComposing) {
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
      <div className={`shrink-0 flex items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 ${
        isSidebarCollapsed ? "pl-14" : "px-4"
      }`}>
        <ModelSelector />
        <div className="flex-1" />
        {/* Flow button */}
        <button
          onClick={() => setViewMode("canvas")}
          disabled={messages.length === 0}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-sm text-zinc-700 dark:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title={messages.length === 0 ? "Flow view requires at least one message" : "Flow View"}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3" strokeWidth={2} />
            <circle cx="6" cy="6" r="2" strokeWidth={2} />
            <circle cx="18" cy="6" r="2" strokeWidth={2} />
            <circle cx="6" cy="18" r="2" strokeWidth={2} />
            <circle cx="18" cy="18" r="2" strokeWidth={2} />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 10l-2.5-2.5M14 10l2.5-2.5M10 14l-2.5 2.5M14 14l2.5 2.5" />
          </svg>
          <span>Flow</span>
        </button>
      </div>

      {/* Reference indicator for branches */}
      {nodeData?.reference && (
        <div className="px-6 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800">
          <div className="max-w-3xl mx-auto flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
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
                  {/* Handle structured content (images) */}
                  {typeof message.content !== "string" && Array.isArray(message.content) ? (
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
                  )}
                </div>
              ) : (
                <div className="prose prose-zinc dark:prose-invert max-w-none prose-p:my-1 prose-pre:my-2 prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-800 prose-code:text-amber-600 dark:prose-code:text-amber-400 prose-code:before:content-none prose-code:after:content-none text-zinc-900 dark:text-zinc-100">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm, remarkMath]} 
                    rehypePlugins={[rehypeKatex]}
                  >
                    {preprocessLaTeX(getMessageText(message.content))}
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

      {/* Input area - sticky at bottom */}
      <div className="sticky bottom-0 shrink-0 bg-white dark:bg-zinc-900 px-4 pb-6 pt-4 border-t border-zinc-100 dark:border-zinc-800">
        <form onSubmit={onSubmit} className="max-w-4xl mx-auto">
          <div className="relative flex flex-col gap-2 p-2 rounded-3xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 shadow-sm focus-within:border-zinc-300 dark:focus-within:border-zinc-600 transition-colors">
            {/* Image Preview */}
            {selectedImage && (
              <div className="relative inline-block w-fit px-2 pt-2">
                <Image 
                  src={selectedImage} 
                  alt="Preview" 
                  width={80}
                  height={80}
                  className="h-20 w-auto rounded-lg object-cover border border-zinc-200 dark:border-zinc-700" 
                  unoptimized
                />
                <button
                  type="button"
                  onClick={clearSelectedImage}
                  className="absolute -top-1 -right-1 p-0.5 bg-zinc-500 text-white rounded-full hover:bg-zinc-600 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            
            <div className="flex items-center gap-2 pl-2">
               {/* File Input (Hidden) */}
               <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*"
                className="hidden"
               />
               
               {/* Upload Button */}
               {isMultimodalModel && (
                 <button
                   type="button"
                   onClick={() => fileInputRef.current?.click()}
                   disabled={isLoading || isProcessingImage}
                   className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50"
                   title="Upload image"
                 >
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                   </svg>
                 </button>
               )}

              <div className="relative flex-1">
                <SmoothCaret textareaRef={textareaRef} isActive={isTextareaFocused} />
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  onCompositionStart={() => setIsComposing(true)}
                  onCompositionEnd={() => setIsComposing(false)}
                  onFocus={() => setIsTextareaFocused(true)}
                  onBlur={() => setIsTextareaFocused(false)}
                  placeholder={isMultimodalModel ? "Message ChatFlow (image supported)" : "Message ChatFlow"}
                  disabled={!currentApiKey || isLoading}
                  className="w-full resize-none bg-transparent text-[15px] leading-6 focus:outline-none disabled:opacity-50 max-h-48 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 pt-[11px] pb-2"
                  rows={1}
                  style={{ 
                    fieldSizing: "content", 
                    caretColor: "transparent"
                  } as React.CSSProperties}
                />
              </div>

                <div className="flex items-center gap-2 pr-2">
                {isLoading ? (
                  <button
                    type="button"
                    onClick={() => abortControllerRef.current?.abort()}
                    className="p-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-full transition-colors shrink-0"
                    title="Stop"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="1" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!currentApiKey || (!input.trim() && !selectedImage) || isProcessingImage}
                    className="p-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-full disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                  </button>
                )}
              </div>
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
