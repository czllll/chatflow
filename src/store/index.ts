import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Node, Edge } from "@xyflow/react";
import { nanoid } from "nanoid";

// Message type for chat history
export type MessageContent = 
  | string 
  | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: MessageContent;
}

// Helper to get text content from message
export const getMessageText = (content: MessageContent): string => {
  if (typeof content === "string") return content;
  return content
    .filter((c) => c.type === "text")
    .map((c) => (c as { text: string }).text)
    .join("");
};

// Highlight marker for branched text
export interface BranchHighlight {
  text: string;
  branchNodeId: string;
  messageId: string;
}

// Node data structure
export interface ChatNodeData {
  messages: Message[];
  reference?: string;
  highlights?: BranchHighlight[];
  pendingAiRequest?: boolean;
  isLoading?: boolean;
  [key: string]: unknown;
}

// Session - contains a complete conversation tree
export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  nodes: Node<ChatNodeData>[];
  edges: Edge[];
  rootNodeId: string;
}

// Provider specific configuration
export interface ProviderModel {
  id: string;
  nickname: string;
  isMultimodal?: boolean;
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  models: ProviderModel[];
  selectedModelId?: string;
}

// R2 Storage configuration
export interface R2StorageConfig {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

// Zustand store interface
interface ChatFlowState {
  // Settings (persisted)
  apiKey: string;
  baseUrl: string;
  modelId: string;
  providerConfigs: Record<string, ProviderConfig>;
  storageConfig: R2StorageConfig;

  // Session management
  sessions: Session[];
  activeSessionId: string;

  // Canvas state (derived from active session)
  nodes: Node<ChatNodeData>[];
  edges: Edge[];
  activeNodeId: string;

  // Sync state
  syncStatus: "idle" | "syncing" | "error";
  lastSyncedAt: number | null;
  syncError: string | null;

  // Settings actions
  setApiKey: (key: string) => void;
  setBaseUrl: (url: string) => void;
  setModelId: (id: string) => void;
  updateProviderConfig: (providerId: string, config: Partial<ProviderConfig>) => void;

  // Session actions
  createSession: () => string;
  deleteSession: (id: string) => void;
  switchSession: (id: string) => void;
  updateSessionTitle: (id: string, title: string) => void;
  getSessionTitle: (session: Session) => string;

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

  // Theme
  theme: "light" | "dark" | "system";
  setTheme: (theme: "light" | "dark" | "system") => void;

  // Sync actions
  syncToRemote: () => Promise<void>;
  syncFromRemote: () => Promise<void>;
  setStorageConfig: (config: Partial<R2StorageConfig>) => void;
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

// Create a new session
const createNewSession = (): Session => {
  const rootNode = createInitialNode();
  return {
    id: nanoid(),
    title: "New Chat",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nodes: [rootNode],
    edges: [],
    rootNodeId: "root",
  };
};

// Generate session title from first message
const generateSessionTitle = (nodes: Node<ChatNodeData>[]): string => {
  const rootNode = nodes.find(n => n.id === "root" || n.data.messages.length > 0);
  if (rootNode && rootNode.data.messages.length > 0) {
    const firstUserMessage = rootNode.data.messages.find(m => m.role === "user");
    if (firstUserMessage) {
      const content = getMessageText(firstUserMessage.content);
      return content.length > 40 ? content.slice(0, 40) + "..." : content;
    }
  }
  return "New Chat";
};

export const useChatFlowStore = create<ChatFlowState>()(
  persist(
    (set, get) => {
      const initialSession = createNewSession();
      
      return {
        // Default settings
        apiKey: "",
        baseUrl: "https://openrouter.ai/api/v1",
        modelId: "",
        providerConfigs: {},
        storageConfig: {
          endpoint: "",
          bucket: "chatflow-sessions",
          accessKeyId: "",
          secretAccessKey: "",
        },

        // Session state
        sessions: [initialSession],
        activeSessionId: initialSession.id,

        // Initial canvas state (from active session)
        nodes: initialSession.nodes,
        edges: initialSession.edges,
        activeNodeId: "root",
        viewMode: "focus",
        activeProviderId: "openrouter",
        theme: "system",

        // Sync state
        syncStatus: "idle",
        lastSyncedAt: null,
        syncError: null,

        // Storage config action
        setStorageConfig: (config) => set((state) => ({
          storageConfig: { ...state.storageConfig, ...config },
        })),

        // Sync actions
        syncToRemote: async () => {
          const state = get();
          set({ syncStatus: "syncing", syncError: null });

          try {
            // Save current session state first
            const currentSessions = state.sessions.map((s) =>
              s.id === state.activeSessionId
                ? { ...s, nodes: state.nodes, edges: state.edges, updatedAt: Date.now() }
                : s
            );

            const response = await fetch("/api/storage/sync", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                sessions: currentSessions,
                storageConfig: state.storageConfig,
              }),
            });

            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.error || "Sync failed");
            }

            const result = await response.json();
            set({ syncStatus: "idle", lastSyncedAt: result.timestamp });
          } catch (error) {
            set({
              syncStatus: "error",
              syncError: error instanceof Error ? error.message : "Unknown error",
            });
          }
        },

        syncFromRemote: async () => {
          const state = get();
          set({ syncStatus: "syncing", syncError: null });

          try {
            // Encode credentials for GET request
            const creds = Buffer.from(JSON.stringify(state.storageConfig)).toString("base64");
            const response = await fetch(`/api/storage/sync?creds=${encodeURIComponent(creds)}`);

            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.error || "Fetch failed");
            }

            const data = await response.json();

            if (data.sessions && data.sessions.length > 0) {
              const firstSession = data.sessions[0];
              set({
                sessions: data.sessions,
                activeSessionId: firstSession.id,
                nodes: firstSession.nodes,
                edges: firstSession.edges,
                activeNodeId: firstSession.rootNodeId,
                syncStatus: "idle",
                lastSyncedAt: Date.now(),
              });
            } else {
              set({ syncStatus: "idle" });
            }
          } catch (error) {
            set({
              syncStatus: "error",
              syncError: error instanceof Error ? error.message : "Unknown error",
            });
          }
        },

        // Get session title - auto-generate from first user message
        getSessionTitle: (session: Session) => {
          if (session.title !== "New Chat") return session.title;
          return generateSessionTitle(session.nodes);
        },

        // Session actions
        createSession: () => {
          const state = get();
          
          // Save current session state before creating new one
          const updatedSessions = state.sessions.map((s) =>
            s.id === state.activeSessionId
              ? { ...s, nodes: state.nodes, edges: state.edges }
              : s
          );
          
          // Create new session with slightly future timestamp to ensure it's on top
          const newSession = createNewSession();
          newSession.updatedAt = Date.now() + 1;
          newSession.createdAt = newSession.updatedAt;
          
          set({
            sessions: [...updatedSessions, newSession],
            activeSessionId: newSession.id,
            nodes: newSession.nodes,
            edges: newSession.edges,
            activeNodeId: "root",
            viewMode: "focus",
          });
          
          return newSession.id;
        },

        deleteSession: (id: string) => {
          const state = get();
          
          const remainingSessions = state.sessions.filter(s => s.id !== id);
          
          // If deleting the last session, create a new one
          if (remainingSessions.length === 0) {
            const newSession = createNewSession();
            set({
              sessions: [newSession],
              activeSessionId: newSession.id,
              nodes: newSession.nodes,
              edges: newSession.edges,
              activeNodeId: newSession.rootNodeId,
            });
            return;
          }
          
          const newActiveSession = state.activeSessionId === id 
            ? remainingSessions[0] 
            : state.sessions.find(s => s.id === state.activeSessionId)!;
          
          set({
            sessions: remainingSessions,
            activeSessionId: newActiveSession.id,
            nodes: newActiveSession.nodes,
            edges: newActiveSession.edges,
            activeNodeId: newActiveSession.rootNodeId,
          });
        },

        switchSession: (id: string) => {
          const state = get();
          const targetSession = state.sessions.find(s => s.id === id);
          if (!targetSession) return;
          
          // Save current session state before switching
          const updatedSessions = state.sessions.map((s) =>
            s.id === state.activeSessionId
              ? { ...s, nodes: state.nodes, edges: state.edges }
              : s
          );
          
          set({
            sessions: updatedSessions,
            activeSessionId: id,
            nodes: targetSession.nodes,
            edges: targetSession.edges,
            activeNodeId: targetSession.rootNodeId,
          });
        },

        updateSessionTitle: (id: string, title: string) => {
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.id === id ? { ...s, title, updatedAt: Date.now() } : s
            ),
          }));
        },

        // Reset canvas - creates new session
        resetCanvas: () => {
          get().createSession();
        },

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
        setTheme: (theme) => set({ theme }),
        
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

        // Node actions - also update session
        addNode: (node) =>
          set((state) => {
            const newNodes = [...state.nodes, node];
            return {
              nodes: newNodes,
              sessions: state.sessions.map((s) =>
                s.id === state.activeSessionId
                  ? { ...s, nodes: newNodes, updatedAt: Date.now() }
                  : s
              ),
            };
          }),

        removeNode: (id) =>
          set((state) => {
            // Find all descendants recursively
            const findAllDescendants = (nodeId: string): string[] => {
              const childIds = state.edges
                .filter(e => e.source === nodeId)
                .map(e => e.target);
              
              const allDescendants = [...childIds];
              childIds.forEach(childId => {
                allDescendants.push(...findAllDescendants(childId));
              });
              
              return allDescendants;
            };
            
            // Get all nodes to delete (the node itself + all descendants)
            const nodesToDelete = new Set([id, ...findAllDescendants(id)]);
            
            // Find parent to remove highlight
            const edgeToRemove = state.edges.find((e) => e.target === id);
            const parentId = edgeToRemove?.source;
            
            // Remove nodes and update parent's highlights
            const newNodes = state.nodes
              .map((node) => {
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
              })
              .filter((n) => !nodesToDelete.has(n.id));
            
            // Remove all edges connected to deleted nodes
            const newEdges = state.edges.filter(
              (e) => !nodesToDelete.has(e.source) && !nodesToDelete.has(e.target)
            );
            
            return {
              nodes: newNodes,
              edges: newEdges,
              sessions: state.sessions.map((s) =>
                s.id === state.activeSessionId
                  ? { ...s, nodes: newNodes, edges: newEdges, updatedAt: Date.now() }
                  : s
              ),
            };
          }),

        updateNodeData: (id, data) =>
          set((state) => {
            // 1. Check if the node is in the active session (optimization)
            const isActiveNode = state.nodes.some((n) => n.id === id);

            if (isActiveNode) {
              // Standard update for active session
              const newNodes = state.nodes.map((node) =>
                node.id === id
                  ? { ...node, data: { ...node.data, ...data } }
                  : node
              );
              
              const currentSession = state.sessions.find(s => s.id === state.activeSessionId);
              const shouldUpdateTitle = currentSession?.title === "New Chat" && 
                newNodes.some(n => n.data.messages.length > 0);
              
              return {
                nodes: newNodes,
                sessions: state.sessions.map((s) =>
                  s.id === state.activeSessionId
                    ? { 
                        ...s, 
                        nodes: newNodes, 
                        updatedAt: Date.now(),
                        title: shouldUpdateTitle ? generateSessionTitle(newNodes) : s.title
                      }
                    : s
                ),
              };
            } else {
              // 2. Handle background update (find the session that contains this node)
              return {
                sessions: state.sessions.map((s) => {
                  const nodeExists = s.nodes.some((n) => n.id === id);
                  if (nodeExists) {
                    const newNodes = s.nodes.map((node) =>
                      node.id === id
                        ? { ...node, data: { ...node.data, ...data } }
                        : node
                    );

                    const shouldUpdateTitle = s.title === "New Chat" && 
                      newNodes.some(n => n.data.messages.length > 0);

                    return {
                      ...s,
                      nodes: newNodes,
                      updatedAt: Date.now(),
                      title: shouldUpdateTitle ? generateSessionTitle(newNodes) : s.title,
                    };
                  }
                  return s;
                }),
              };
            }
          }),

        setNodes: (nodes) =>
          set((state) => ({
            nodes,
            sessions: state.sessions.map((s) =>
              s.id === state.activeSessionId
                ? { ...s, nodes, updatedAt: Date.now() }
                : s
            ),
          })),

        // Edge actions - also update session
        addEdge: (edge) =>
          set((state) => {
            const newEdges = [...state.edges, edge];
            return {
              edges: newEdges,
              sessions: state.sessions.map((s) =>
                s.id === state.activeSessionId
                  ? { ...s, edges: newEdges, updatedAt: Date.now() }
                  : s
              ),
            };
          }),

        setEdges: (edges) =>
          set((state) => ({
            edges,
            sessions: state.sessions.map((s) =>
              s.id === state.activeSessionId
                ? { ...s, edges, updatedAt: Date.now() }
                : s
            ),
          })),

        // Branch creation with initial prompt
        createBranch: (parentId, selectedText, messageId, initialPrompt) => {
          const state = get();
          const parentNode = state.nodes.find((n) => n.id === parentId);
          if (!parentNode) return "";

          const siblings = state.nodes.filter(
            (n) => Math.abs(n.position.y - parentNode.position.y) < 150
          );
          const maxX = Math.max(
            ...siblings.map((n) => n.position.x),
            parentNode.position.x
          );

          const existingBranches = state.edges.filter((e) => e.source === parentId).length;
          const yOffset = existingBranches * 280;

          const newNodeId = nanoid();
          
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
              pendingAiRequest: !!initialPrompt,
            },
          };

          const newEdge: Edge = {
            id: `e-${parentId}-${newNodeId}`,
            source: parentId,
            target: newNodeId,
            sourceHandle: null,
            targetHandle: null,
            type: "smoothstep",
            animated: true,
            style: { 
              stroke: "#f59e0b", 
              strokeWidth: 2,
              strokeDasharray: "5,5",
            },
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

          const newHighlight: BranchHighlight = {
            text: selectedText,
            branchNodeId: newNodeId,
            messageId: messageId || "",
          };

          set((state) => {
            const newNodes = [
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
            ];
            
            const newEdges = [...state.edges, newEdge];
            
            return {
              nodes: newNodes,
              edges: newEdges,
              activeNodeId: newNodeId,
              sessions: state.sessions.map((s) =>
                s.id === state.activeSessionId
                  ? { ...s, nodes: newNodes, edges: newEdges, updatedAt: Date.now() }
                  : s
              ),
            };
          });

          return newNodeId;
        },
      };
    },
    {
      name: "chatflow-storage",
      partialize: (state) => ({
        apiKey: state.apiKey,
        baseUrl: state.baseUrl,
        modelId: state.modelId,
        providerConfigs: state.providerConfigs,
        activeProviderId: state.activeProviderId,
        theme: state.theme,
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
      }),
    }
  )
);
