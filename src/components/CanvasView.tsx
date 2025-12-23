"use client";

import { useCallback, useEffect } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useChatFlowStore, type ChatNodeData } from "@/store";
import ChatNode from "./ChatNode";

const nodeTypes = {
  chatNode: ChatNode,
};

export default function CanvasView() {
  const { 
    nodes: storeNodes, 
    edges: storeEdges, 
    setNodes, 
    setEdges,
    setViewMode 
  } = useChatFlowStore();

  const [nodes, setLocalNodes, onNodesChange] = useNodesState<Node<ChatNodeData>>(storeNodes);
  const [edges, setLocalEdges, onEdgesChange] = useEdgesState(storeEdges);

  // Sync store changes to local state
  useEffect(() => {
    setLocalNodes(storeNodes);
  }, [storeNodes, setLocalNodes]);

  useEffect(() => {
    setLocalEdges(storeEdges);
  }, [storeEdges, setLocalEdges]);

  // Sync local state changes back to store
  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);
    },
    [onNodesChange]
  );

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes);
    },
    [onEdgesChange]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setLocalEdges((eds) => addEdge(params, eds));
    },
    [setLocalEdges]
  );

  // Double-click to auto-layout
  const onPaneDoubleClick = useCallback(() => {
    const sortedNodes = [...nodes].sort(
      (a, b) => a.position.x - b.position.x
    );
    const layoutedNodes = sortedNodes.map((node, index) => ({
      ...node,
      position: {
        x: 100 + index * 500,
        y: 100,
      },
    }));
    setLocalNodes(layoutedNodes);
    setNodes(layoutedNodes);
  }, [nodes, setLocalNodes, setNodes]);

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onPaneClick={() => {}}
        onDoubleClick={onPaneDoubleClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: "smoothstep",
          animated: true,
        }}
      >
        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      </ReactFlow>

      {/* Back to Focus View button */}
      <button
        onClick={() => setViewMode("focus")}
        className="absolute top-4 left-4 z-50 flex items-center gap-2 px-3 py-2 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors text-sm font-medium text-zinc-700 dark:text-zinc-200"
        title="Back to Focus View"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Focus
      </button>
    </div>
  );
}
