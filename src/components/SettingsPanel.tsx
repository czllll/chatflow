"use client";

import { useState, useEffect, useCallback } from "react";
import { useChatFlowStore } from "@/store";

interface ModelInfo {
  id: string;
  name?: string;
}

// Provider icons as SVG components
const ProviderIcons: Record<string, React.ReactNode> = {
  openai: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
    </svg>
  ),
  openrouter: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.778 1.844v1.919q-.569-.026-1.138-.032-.708-.008-1.415.037c-1.93.126-4.023.728-6.149 2.237-2.911 2.066-2.731 1.95-4.14 2.75-.396.223-1.342.574-2.185.798-.841.225-1.753.333-1.751.333v4.229s.768.108 1.61.333c.842.224 1.789.575 2.185.799 1.41.798 1.228.683 4.14 2.75 2.126 1.509 4.22 2.11 6.148 2.236.88.058 1.716.041 2.555.005v1.918l7.222-4.168-7.222-4.17v2.176c-.86.038-1.611.065-2.278.021-1.364-.09-2.417-.357-3.979-1.465-2.244-1.593-2.866-2.027-3.68-2.508.889-.518 1.449-.906 3.822-2.59 1.56-1.109 2.614-1.377 3.978-1.466.667-.044 1.418-.017 2.278.02v2.176L24 6.014Z"/>
    </svg>
  ),
  anthropic: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z"/>
    </svg>
  ),
  ollama: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.361 10.26a.894.894 0 0 0-.558.47l-.072.148.001.207c0 .193.004.217.059.353.076.193.152.312.291.448.24.238.51.3.872.205a.86.86 0 0 0 .517-.436.752.752 0 0 0 .08-.498c-.064-.453-.33-.782-.724-.897a1.06 1.06 0 0 0-.466 0zm-9.203.005c-.305.096-.533.32-.65.639a1.187 1.187 0 0 0-.06.52c.057.309.31.59.598.667.362.095.632.033.872-.205.14-.136.215-.255.291-.448.055-.136.059-.16.059-.353l.001-.207-.072-.148a.894.894 0 0 0-.565-.472 1.02 1.02 0 0 0-.474.007Zm4.184 2c-.131.071-.223.25-.195.383.031.143.157.288.353.407.105.063.112.072.117.136.004.038-.01.146-.029.243-.02.094-.036.194-.036.222.002.074.07.195.143.253.064.052.076.054.255.059.164.005.198.001.264-.03.169-.082.212-.234.15-.525-.052-.243-.042-.28.087-.355.137-.08.281-.219.324-.314a.365.365 0 0 0-.175-.48.394.394 0 0 0-.181-.033c-.126 0-.207.03-.355.124l-.085.053-.053-.032c-.219-.13-.259-.145-.391-.143a.396.396 0 0 0-.193.032zm.39-2.195c-.373.036-.475.05-.654.086-.291.06-.68.195-.951.328-.94.46-1.589 1.226-1.787 2.114-.04.176-.045.234-.045.53 0 .294.005.357.043.524.264 1.16 1.332 2.017 2.714 2.173.3.033 1.596.033 1.896 0 1.11-.125 2.064-.727 2.493-1.571.114-.226.169-.372.22-.602.039-.167.044-.23.044-.523 0-.297-.005-.355-.045-.531-.288-1.29-1.539-2.304-3.072-2.497a6.873 6.873 0 0 0-.855-.031zm.645.937a3.283 3.283 0 0 1 1.44.514c.223.148.537.458.671.662.166.251.26.508.303.82.02.143.01.251-.043.482-.08.345-.332.705-.672.957a3.115 3.115 0 0 1-.689.348c-.382.122-.632.144-1.525.138-.582-.006-.686-.01-.853-.042-.57-.107-1.022-.334-1.35-.68-.264-.28-.385-.535-.45-.946-.03-.192.025-.509.137-.776.136-.326.488-.73.836-.963.403-.269.934-.46 1.422-.512.187-.02.586-.02.773-.002zm-5.503-11a1.653 1.653 0 0 0-.683.298C5.617.74 5.173 1.666 4.985 2.819c-.07.436-.119 1.04-.119 1.503 0 .544.064 1.24.155 1.721.02.107.031.202.023.208a8.12 8.12 0 0 1-.187.152 5.324 5.324 0 0 0-.949 1.02 5.49 5.49 0 0 0-.94 2.339 6.625 6.625 0 0 0-.023 1.357c.091.78.325 1.438.727 2.04l.13.195-.037.064c-.269.452-.498 1.105-.605 1.732-.084.496-.095.629-.095 1.294 0 .67.009.803.088 1.266.095.555.288 1.143.503 1.534.071.128.243.393.264.407.007.003-.014.067-.046.141a7.405 7.405 0 0 0-.548 1.873c-.062.417-.071.552-.071.991 0 .56.031.832.148 1.279L3.42 24h1.478l-.05-.091c-.297-.552-.325-1.575-.068-2.597.117-.472.25-.819.498-1.296l.148-.29v-.177c0-.165-.003-.184-.057-.293a.915.915 0 0 0-.194-.25 1.74 1.74 0 0 1-.385-.543c-.424-.92-.506-2.286-.208-3.451.124-.486.329-.918.544-1.154a.787.787 0 0 0 .223-.531c0-.195-.07-.355-.224-.522a3.136 3.136 0 0 1-.817-1.729c-.14-.96.114-2.005.69-2.834.563-.814 1.353-1.336 2.237-1.475.199-.033.57-.028.776.01.226.04.367.028.512-.041.179-.085.268-.19.374-.431.093-.215.165-.333.36-.576.234-.29.46-.489.822-.729.413-.27.884-.467 1.352-.561.17-.035.25-.04.569-.04.319 0 .398.005.569.04a4.07 4.07 0 0 1 1.914.997c.117.109.398.457.488.602.034.057.095.177.132.267.105.241.195.346.374.43.14.068.286.082.503.045.343-.058.607-.053.943.016 1.144.23 2.14 1.173 2.581 2.437.385 1.108.276 2.267-.296 3.153-.097.15-.193.27-.333.419-.301.322-.301.722-.001 1.053.493.539.801 1.866.708 3.036-.062.772-.26 1.463-.533 1.854a2.096 2.096 0 0 1-.224.258.916.916 0 0 0-.194.25c-.054.109-.057.128-.057.293v.178l.148.29c.248.476.38.823.498 1.295.253 1.008.231 2.01-.059 2.581a.845.845 0 0 0-.044.098c0 .006.329.009.732.009h.73l.02-.074.036-.134c.019-.076.057-.3.088-.516.029-.217.029-1.016 0-1.258-.11-.875-.295-1.57-.597-2.226-.032-.074-.053-.138-.046-.141.008-.005.057-.074.108-.152.376-.569.607-1.284.724-2.228.031-.26.031-1.378 0-1.628-.083-.645-.182-1.082-.348-1.525a6.083 6.083 0 0 0-.329-.7l-.038-.064.131-.194c.402-.604.636-1.262.727-2.04a6.625 6.625 0 0 0-.024-1.358 5.512 5.512 0 0 0-.939-2.339 5.325 5.325 0 0 0-.95-1.02 8.097 8.097 0 0 1-.186-.152.692.692 0 0 1 .023-.208c.208-1.087.201-2.443-.017-3.503-.19-.924-.535-1.658-.98-2.082-.354-.338-.716-.482-1.15-.455-.996.059-1.8 1.205-2.116 3.01a6.805 6.805 0 0 0-.097.726c0 .036-.007.066-.015.066a.96.96 0 0 1-.149-.078A4.857 4.857 0 0 0 12 3.03c-.832 0-1.687.243-2.456.698a.958.958 0 0 1-.148.078c-.008 0-.015-.03-.015-.066a6.71 6.71 0 0 0-.097-.725C8.997 1.392 8.337.319 7.46.048a2.096 2.096 0 0 0-.585-.041Zm.293 1.402c.248.197.523.759.682 1.388.03.113.06.244.069.292.007.047.026.152.041.233.067.365.098.76.102 1.24l.002.475-.12.175-.118.178h-.278c-.324 0-.646.041-.954.124l-.238.06c-.033.007-.038-.003-.057-.144a8.438 8.438 0 0 1 .016-2.323c.124-.788.413-1.501.696-1.711.067-.05.079-.049.157.013zm9.825-.012c.17.126.358.46.498.888.28.854.36 2.028.212 3.145-.019.14-.024.151-.057.144l-.238-.06a3.693 3.693 0 0 0-.954-.124h-.278l-.119-.178-.119-.175.002-.474c.004-.669.066-1.19.214-1.772.157-.623.434-1.185.68-1.382.078-.062.09-.063.159-.012z"/>
    </svg>
  ),
  custom: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ),
};

// Provider presets
const PROVIDERS = [
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "anthropic", name: "Anthropic", baseUrl: "https://api.anthropic.com/v1" },
  { id: "ollama", name: "Ollama", baseUrl: "http://localhost:11434/v1" },
  { id: "custom", name: "Custom", baseUrl: "" },
];

export default function SettingsPanel() {
  const { 
    apiKey, 
    baseUrl, 
    modelId, 
    providerConfigs,
    activeProviderId,
    setApiKey, 
    setBaseUrl, 
    setModelId,
    updateProviderConfig,
    setActiveProvider 
  } = useChatFlowStore();
  
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"general" | "models">("models");
  const [selectedProvider, setSelectedProvider] = useState("openrouter");
  
  // Local state for the selected provider
  const [localApiKey, setLocalApiKey] = useState("");
  const [localBaseUrl, setLocalBaseUrl] = useState("");
  const [localModelId, setLocalModelId] = useState("");
  
  // Model management state
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  
  // Selection modal state
  const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedModelsInModal, setSelectedModelsInModal] = useState<Set<string>>(new Set());

  // Initialize local state when modal opens or provider changes
  useEffect(() => {
    if (isOpen) {
      const config = providerConfigs[selectedProvider];
      const preset = PROVIDERS.find(p => p.id === selectedProvider);
      
      if (config) {
        setLocalApiKey(config.apiKey || "");
        setLocalBaseUrl(config.baseUrl || preset?.baseUrl || "");
        setLocalModelId(config.selectedModelId || "");
      } else {
        // Fallback for providers not yet in config
        setLocalApiKey("");
        setLocalBaseUrl(preset?.baseUrl || "");
        setLocalModelId("");
      }
    }
  }, [isOpen, selectedProvider, providerConfigs]);

  // Fetch models when API key or base URL changes
  const fetchModels = useCallback(async () => {
    if (!localApiKey || !localBaseUrl) {
      setModels([]);
      return;
    }

    setIsLoadingModels(true);
    setModelError(null);

    try {
      const isOpenRouter = localBaseUrl.includes("openrouter.ai");
      
      const response = await fetch(`${localBaseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${localApiKey}`,
          ...(isOpenRouter && {
            "HTTP-Referer": "https://chatflow.app",
            "X-Title": "ChatFlow",
          }),
        },
      });

      if (!response.ok) {
        setModelError(`Failed to fetch models: ${response.status}`);
        setModels([]);
        return;
      }

      const data = await response.json();
      
      let modelList: ModelInfo[] = [];
      
      if (data.data && Array.isArray(data.data)) {
        modelList = data.data.map((m: { id: string; name?: string }) => ({
          id: m.id,
          name: m.name || m.id,
        }));
      } else if (Array.isArray(data)) {
        modelList = data.map((m: string | { id: string; name?: string }) => ({
          id: typeof m === 'string' ? m : m.id,
          name: typeof m === 'string' ? m : (m.name || m.id),
        }));
      }

      modelList.sort((a, b) => a.id.localeCompare(b.id));
      setModels(modelList);
      
      if (modelList.length > 0 && !modelList.find((m) => m.id === localModelId)) {
        const defaultModel = modelList.find((m) => 
          m.id.includes("gpt-4o") || 
          m.id.includes("claude-3") ||
          m.id.includes("gemini")
        ) || modelList[0];
        setLocalModelId(defaultModel.id);
      }
    } catch (error) {
      // Catch network errors or parsing errors silently
      setModelError((error as Error).message);
      setModels([]);
    } finally {
      setIsLoadingModels(false);
    }
  }, [localApiKey, localBaseUrl, localModelId]);



  const handleProviderChange = (providerId: string) => {
    setSelectedProvider(providerId);
    setModels([]);
    setModelError(null);
  };

  const handleSave = () => {
    // Update global settings (legacy compatibility)
    if (selectedProvider === "openai") {
      setApiKey(localApiKey);
      setBaseUrl(localBaseUrl);
      setModelId(localModelId);
    }

    // Update per-provider config
    updateProviderConfig(selectedProvider, {
      apiKey: localApiKey,
      baseUrl: localBaseUrl,
      selectedModelId: localModelId,
    });

    setActiveProvider(selectedProvider);
    setIsOpen(false);
  };

  const handleAddModel = (model: ModelInfo) => {
    const config = providerConfigs[selectedProvider] || { models: [] };
    if (!config.models.find(m => m.id === model.id)) {
      updateProviderConfig(selectedProvider, {
        models: [...config.models, { id: model.id, nickname: model.name || model.id }]
      });
    }
  };

  const handleRemoveModel = (modelId: string) => {
    const config = providerConfigs[selectedProvider];
    if (config) {
      updateProviderConfig(selectedProvider, {
        models: config.models.filter(m => m.id !== modelId)
      });
    }
  };

  const handleUpdateNickname = (modelId: string, nickname: string) => {
    const config = providerConfigs[selectedProvider];
    if (config) {
      updateProviderConfig(selectedProvider, {
        models: config.models.map(m => m.id === modelId ? { ...m, nickname } : m)
      });
    }
  };

  const handleSelectModel = (modelId: string) => {
    setLocalModelId(modelId);
    updateProviderConfig(selectedProvider, { selectedModelId: modelId });
  };

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <>
      {/* Settings toggle button - bottom left */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 left-4 z-50 p-3 bg-white dark:bg-zinc-800 rounded-full shadow-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
        title="Settings"
      >
        <svg className="w-5 h-5 text-zinc-600 dark:text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {/* API Key indicator */}
      {(() => {
        const currentConfig = providerConfigs[activeProviderId];
        const hasApiKey = currentConfig?.apiKey || apiKey;
        return !hasApiKey && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 rounded-lg text-sm font-medium shadow-lg">
            Please set your API key in settings to start chatting
          </div>
        );
      })()}

      {/* Settings modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onKeyDown={(e) => e.stopPropagation()}>
          <div 
            className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden h-[80vh] max-h-[80vh] min-h-0 flex flex-col"
            onMouseDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
                Settings
              </h2>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-6 py-2 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
              <button
                onClick={() => setActiveTab("general")}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === "general"
                    ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                General
              </button>
              <button
                onClick={() => setActiveTab("models")}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === "models"
                    ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                Models
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden min-h-0">
              {activeTab === "general" ? (
                <div className="p-6 space-y-6 h-full overflow-y-auto overscroll-contain">
                  <div className="text-center py-12 text-zinc-400">
                    General settings coming soon...
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-0 overflow-hidden">
                  {/* Provider sidebar */}
                  <div className="w-48 shrink-0 min-h-0 border-r border-zinc-100 dark:border-zinc-800 p-2 space-y-1 overflow-y-auto overscroll-contain bg-zinc-50 dark:bg-zinc-800/50">
                    {PROVIDERS.map((provider) => (
                      <button
                        key={provider.id}
                        onClick={() => handleProviderChange(provider.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors text-left ${
                          selectedProvider === provider.id
                            ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                            : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        }`}
                      >
                        <span>{ProviderIcons[provider.id]}</span>
                        <span>{provider.name}</span>
                      </button>
                    ))}
                  </div>

                  {/* Configuration panel */}
                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                    <div className="p-6 space-y-5">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                          {PROVIDERS.find(p => p.id === selectedProvider)?.name || "Custom"}
                        </h3>
                      </div>

                      {/* API Key */}
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                          API Key
                        </label>
                        <div className="relative">
                          <input
                            type={showApiKey ? "text" : "password"}
                            value={localApiKey}
                            onChange={(e) => setLocalApiKey(e.target.value)}
                            placeholder="sk-..."
                            className="w-full px-4 py-2.5 pr-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors"
                          >
                            {showApiKey ? (
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                                <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                                <line x1="2" y1="2" x2="22" y2="22" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Base URL */}
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                          API Base URL
                        </label>
                        <input
                          type="text"
                          value={localBaseUrl}
                          onChange={(e) => setLocalBaseUrl(e.target.value)}
                          placeholder="https://api.openai.com/v1"
                          className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm font-mono"
                        />
                      </div>

                      {/* Model Section */
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                            Models
                          </label>
                          <div className="flex items-center gap-3">
                            {selectedProvider === "openrouter" && (
                              <>
                                <button
                                  onClick={() => {
                                    updateProviderConfig(selectedProvider, { models: [] });
                                  }}
                                  className="flex items-center gap-1 text-xs text-zinc-500 hover:text-red-600 transition-colors"
                                >
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                  </svg>
                                  Delete All
                                </button>
                                <button
                                  onClick={() => {
                                    fetchModels();
                                    setIsSelectionModalOpen(true);
                                  }}
                                  className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 transition-colors"
                                >
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 5v14m-7-7h14" />
                                  </svg>
                                  New
                                </button>
                              </>
                            )}
                            <button
                              onClick={fetchModels}
                              disabled={isLoadingModels}
                              className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 disabled:opacity-50 transition-colors"
                            >
                              <svg className={`w-3.5 h-3.5 ${isLoadingModels ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                <polyline points="21 3 21 9 15 9" />
                              </svg>
                              Get Model List
                            </button>
                          </div>
                        </div>

                        {selectedProvider === "openrouter" ? (
                          <div className="border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
                            <table className="w-full text-sm text-left">
                              <thead className="bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-medium">
                                <tr>
                                  <th className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-800">Nick name</th>
                                  <th className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-800">Model ID</th>
                                  <th className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-800 w-20 text-center">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {(providerConfigs[selectedProvider]?.models || []).map((model) => (
                                  <tr 
                                    key={model.id}
                                    className={`group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer ${
                                      localModelId === model.id ? "bg-amber-50/50 dark:bg-amber-900/10" : ""
                                    }`}
                                    onClick={() => handleSelectModel(model.id)}
                                  >
                                    <td className="px-4 py-2">
                                      <input
                                        type="text"
                                        value={model.nickname}
                                        onChange={(e) => handleUpdateNickname(model.id, e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-full bg-transparent border-none p-0 focus:ring-0 text-sm font-medium text-zinc-900 dark:text-white"
                                        placeholder="Model nickname"
                                      />
                                    </td>
                                    <td className="px-4 py-2 font-mono text-xs text-zinc-500 truncate max-w-[200px]">
                                      {model.id}
                                    </td>
                                    <td className="px-4 py-2 text-center">
                                      <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveModel(model.id);
                                          }}
                                          className="p-1.5 text-zinc-400 hover:text-red-500 transition-colors"
                                        >
                                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                          </svg>
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                                {(providerConfigs[selectedProvider]?.models || []).length === 0 && (
                                  <tr>
                                    <td colSpan={3} className="px-4 py-8 text-center text-zinc-400 italic">
                                      No models configured. Click &quot;New&quot; to add models.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div>
                            {isLoadingModels ? (
                              <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
                                <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                                <span className="text-sm text-zinc-500">Loading models...</span>
                              </div>
                            ) : models.length > 0 ? (
                              <select
                                value={localModelId}
                                onChange={(e) => handleSelectModel(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm font-mono"
                              >
                                {models.map((model) => (
                                  <option key={model.id} value={model.id}>
                                    {model.name || model.id}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={localModelId}
                                onChange={(e) => setLocalModelId(e.target.value)}
                                placeholder="Type model ID manually"
                                className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm font-mono"
                              />
                            )}
                            {modelError && (
                              <p className="mt-1.5 text-xs text-red-500">
                                {modelError}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
}
                      {/* Current status */}
                      {localApiKey && (
                        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                          <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
                            <span>API key configured • {models.length} models available</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 shrink-0">
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Model Selection Modal */}
      {isSelectionModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden max-h-[70vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                  Select models to add
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-500">
                  {selectedModelsInModal.size} selected
                </span>
              </div>
              
              <div className="relative w-48">
                <input
                  type="text"
                  placeholder="Search models..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </div>
            </div>

            {/* Modal List */}
            <div className="flex-1 overflow-y-auto p-2">
              {isLoadingModels ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-zinc-500">Fetching models from OpenRouter...</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {models
                    .filter(m => m.id.toLowerCase().includes(searchQuery.toLowerCase()) || m.name?.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((model) => (
                      <label 
                        key={model.id}
                        className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedModelsInModal.has(model.id)}
                          onChange={() => {
                            const newSelected = new Set(selectedModelsInModal);
                            if (newSelected.has(model.id)) {
                              newSelected.delete(model.id);
                            } else {
                              newSelected.add(model.id);
                            }
                            setSelectedModelsInModal(newSelected);
                          }}
                          className="w-4 h-4 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                        />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-zinc-900 dark:text-white">
                            {model.name}
                          </span>
                          <span className="text-xs text-zinc-500 font-mono">
                            {model.id}
                          </span>
                        </div>
                      </label>
                    ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setIsSelectionModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const selectedList = models.filter(m => selectedModelsInModal.has(m.id));
                    const config = providerConfigs[selectedProvider] || { models: [] };
                    const existingIds = new Set(config.models.map(m => m.id));
                    
                    const newModels = selectedList
                      .filter(m => !existingIds.has(m.id))
                      .map(m => ({ id: m.id, nickname: m.name || m.id }));
                    
                    updateProviderConfig(selectedProvider, {
                      models: [...config.models, ...newModels]
                    });
                    
                    setIsSelectionModalOpen(false);
                    setSelectedModelsInModal(new Set());
                  }}
                  className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
                >
                  Confirm
                </button>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setSelectedModelsInModal(new Set(models.map(m => m.id)))}
                  className="text-xs text-zinc-500 hover:text-amber-600"
                >
                  Select All
                </button>
                <button
                  onClick={() => setSelectedModelsInModal(new Set())}
                  className="text-xs text-zinc-500 hover:text-amber-600"
                >
                  Select None
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
