import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Node, Edge } from "@xyflow/react";
import { nanoid } from "nanoid";

// Message type for chat history
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

// Highlight marker for branched text
export interface BranchHighlight {
  text: string;
  branchNodeId: string;
  messageId: string; // Which message contains this highlight
}

// Node data structure
export interface ChatNodeData {
  messages: Message[];
  reference?: string; // Selected text that triggered this branch
  highlights?: BranchHighlight[]; // Text that has been branched from this node
  pendingAiRequest?: boolean; // Flag to trigger auto AI request on mount
  isLoading?: boolean;
  [key: string]: unknown; // Index signature for Record<string, unknown> compatibility
}

// Zustand store interface
// Provider specific configuration
export interface ProviderModel {
  id: string;
  nickname: string;
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  models: ProviderModel[];
  selectedModelId?: string;
}

// Zustand store interface
interface ChatFlowState {
  // Settings (persisted)
  apiKey: string; // Global/current fallback
  baseUrl: string; // Global/current fallback
  modelId: string; // Global/current fallback
  providerConfigs: Record<string, ProviderConfig>; // Per-provider config

  // Canvas state
  nodes: Node<ChatNodeData>[];
  edges: Edge[];
  activeNodeId: string; // Currently focused node

  // Settings actions
  setApiKey: (key: string) => void;
  setBaseUrl: (url: string) => void;
  setModelId: (id: string) => void;
  updateProviderConfig: (providerId: string, config: Partial<ProviderConfig>) => void;

  // Node actions
  addNode: (node: Node<ChatNodeData>) => void;
  removeNode: (id: string) => void;
  updateNodeData: (id: string, data: Partial<ChatNodeData>) => void;
  setNodes: (nodes: Node<ChatNodeData>[]) => void;

  // Edge actions
  addEdge: (edge: Edge) => void;
  setEdges: (edges: Edge[]) => void;

  // Branch action
  createBranch: (parentId: string, selectedText: string, messageId?: string, initialPrompt?: string) => string;

  // Canvas actions
  resetCanvas: () => void;
  setActiveNode: (nodeId: string) => void;
  
  // View mode
  viewMode: "focus" | "canvas";
  setViewMode: (mode: "focus" | "canvas") => void;

  // Active provider
  activeProviderId: string;
  setActiveProvider: (id: string) => void;
}

// Initial root node
const createInitialNode = (): Node<ChatNodeData> => ({
  id: "root",
  type: "chatNode",
  position: { x: 100, y: 100 },
  data: {
    messages: [],
    highlights: [],
  },
});

export const useChatFlowStore = create<ChatFlowState>()(
  persist(
    (set, get) => ({
      // Default settings
      apiKey: "",
      baseUrl: "https://openrouter.ai/api/v1",
      modelId: "",
      providerConfigs: {},

      // Initial canvas state
      nodes: [createInitialNode()],
      edges: [],
      activeNodeId: "root",
      viewMode: "focus",
      activeProviderId: "openrouter",

      // Reset canvas to fresh state
      resetCanvas: () => set({
        nodes: [createInitialNode()],
        edges: [],
        activeNodeId: "root",
        viewMode: "focus",
      }),

      // Set active node
      setActiveNode: (nodeId) => set({ activeNodeId: nodeId }),
      
      // Set view mode
      setViewMode: (mode) => set({ viewMode: mode }),

      // Set active provider
      setActiveProvider: (id) => set({ activeProviderId: id }),

      // Settings actions
      setApiKey: (key) => set({ apiKey: key }),
      setBaseUrl: (url) => set({ baseUrl: url }),
      setModelId: (id) => set({ modelId: id }),
      
      updateProviderConfig: (providerId, config) => set((state) => {
        const currentConfig = state.providerConfigs[providerId] || {
          apiKey: "",
          baseUrl: "",
          models: [],
        };
        return {
          providerConfigs: {
            ...state.providerConfigs,
            [providerId]: {
              ...currentConfig,
              ...config,
            }
          }
        };
      }),

      // Node actions
      addNode: (node) =>
        set((state) => ({ nodes: [...state.nodes, node] })),

      removeNode: (id) =>
        set((state) => {
          // Also remove highlight from parent when removing branch
          const edgeToRemove = state.edges.find((e) => e.target === id);
          const parentId = edgeToRemove?.source;
          
          return {
            nodes: state.nodes.map((node) => {
              if (node.id === parentId && node.data.highlights) {
                return {
                  ...node,
                  data: {
                    ...node.data,
                    highlights: node.data.highlights.filter((h) => h.branchNodeId !== id),
                  },
                };
              }
              return node;
            }).filter((n) => n.id !== id),
            edges: state.edges.filter((e) => e.source !== id && e.target !== id),
          };
        }),

      updateNodeData: (id, data) =>
        set((state) => ({
          nodes: state.nodes.map((node) =>
            node.id === id
              ? { ...node, data: { ...node.data, ...data } }
              : node
          ),
        })),

      setNodes: (nodes) => set({ nodes }),

      // Edge actions
      addEdge: (edge) =>
        set((state) => ({ edges: [...state.edges, edge] })),

      setEdges: (edges) => set({ edges }),

      // Branch creation with initial prompt
      createBranch: (parentId, selectedText, messageId, initialPrompt) => {
        const state = get();
        const parentNode = state.nodes.find((n) => n.id === parentId);
        if (!parentNode) return "";

        // Find nodes at similar Y level to avoid overlap
        const siblings = state.nodes.filter(
          (n) => Math.abs(n.position.y - parentNode.position.y) < 150
        );
        const maxX = Math.max(
          ...siblings.map((n) => n.position.x),
          parentNode.position.x
        );

        // Count existing branches to offset Y position
        const existingBranches = state.edges.filter((e) => e.source === parentId).length;
        const yOffset = existingBranches * 280; // Larger gap to avoid overlap

        const newNodeId = nanoid();
        
        // Create initial message if prompt is provided
        const initialMessage: Message | null = initialPrompt
          ? {
              id: Date.now().toString(),
              role: "user",
              content: initialPrompt,
            }
          : null;

        const newNode: Node<ChatNodeData> = {
          id: newNodeId,
          type: "chatNode",
          position: {
            x: maxX + 450,
            y: parentNode.position.y + yOffset,
          },
          data: {
            messages: initialMessage ? [initialMessage] : [],
            reference: selectedText,
            highlights: [],
            // Mark that this node needs to auto-send to AI
            pendingAiRequest: !!initialPrompt,
          },
        };

        const newEdge: Edge = {
          id: `e-${parentId}-${newNodeId}`,
          source: parentId,
          target: newNodeId,
          sourceHandle: null,
          targetHandle: null,
          type: "smoothstep", // Better routing around nodes
          animated: true,
          style: { 
            stroke: "#f59e0b", 
            strokeWidth: 2,
            strokeDasharray: "5,5",
          },
          // Label showing the branched text (truncated)
          label: selectedText.length > 20 ? selectedText.slice(0, 20) + "..." : selectedText,
          labelStyle: { 
            fontSize: 10, 
            fill: "#f59e0b",
            fontWeight: 500,
          },
          labelBgStyle: { 
            fill: "#fffbeb", 
            fillOpacity: 0.9,
          },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
        };

        // Add highlight to parent node
        const newHighlight: BranchHighlight = {
          text: selectedText,
          branchNodeId: newNodeId,
          messageId: messageId || "",
        };

        set((state) => ({
          nodes: [
            ...state.nodes.map((node) =>
              node.id === parentId
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      highlights: [...(node.data.highlights || []), newHighlight],
                    },
                  }
                : node
            ),
            newNode,
          ],
          edges: [...state.edges, newEdge],
          activeNodeId: newNodeId, // Auto-switch to new branch
        }));

        return newNodeId;
      },
    }),
    {
      name: "chatflow-storage",
      partialize: (state) => ({
        apiKey: state.apiKey,
        baseUrl: state.baseUrl,
        modelId: state.modelId,
        providerConfigs: state.providerConfigs,
        activeProviderId: state.activeProviderId,
        nodes: state.nodes,
        edges: state.edges,
      }),
    }
  )
);
