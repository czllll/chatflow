import { Node, Edge } from "@xyflow/react";
import { ChatNodeData } from "@/store";

export interface TreeNodeData {
  node: Node<ChatNodeData>;
  children: TreeNodeData[];
  isActive: boolean;
}

/**
 * Build a tree structure from flat nodes and edges
 * @param nodes - All nodes in the session
 * @param edges - All edges defining parent-child relationships
 * @param rootNodeId - ID of the root node
 * @param activeNodeId - ID of the currently active node
 * @returns Tree structure with root node and nested children
 */
export function buildTree(
  nodes: Node<ChatNodeData>[],
  edges: Edge[],
  rootNodeId: string,
  activeNodeId: string
): TreeNodeData | null {
  // Create a map for quick node lookup
  const nodeMap = new Map<string, Node<ChatNodeData>>();
  nodes.forEach(node => nodeMap.set(node.id, node));

  // Create a map of parent -> children relationships
  const childrenMap = new Map<string, string[]>();
  edges.forEach(edge => {
    const children = childrenMap.get(edge.source) || [];
    children.push(edge.target);
    childrenMap.set(edge.source, children);
  });

  // Recursive function to build tree
  function buildSubtree(nodeId: string): TreeNodeData | null {
    const node = nodeMap.get(nodeId);
    if (!node) return null;

    const childIds = childrenMap.get(nodeId) || [];
    const children = childIds
      .map(childId => buildSubtree(childId))
      .filter((child): child is TreeNodeData => child !== null);

    return {
      node,
      children,
      isActive: nodeId === activeNodeId,
    };
  }

  return buildSubtree(rootNodeId);
}
