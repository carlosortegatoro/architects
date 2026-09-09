import type { Node } from '@xyflow/react'
import type { AnnotationNodeData, GroupNodeData, InfoCardNodeData, NodeShape, SystemNodeData } from '../types'

type ShapeNode = Node<SystemNodeData | GroupNodeData | AnnotationNodeData | InfoCardNodeData>

export const NODE_SHAPE_SIZES: Record<NodeShape, { width: number; height: number }> = {
  full: { width: 220, height: 110 },
  logoOnly: { width: 90, height: 90 },
  textOnly: { width: 220, height: 110 },
  infoCard: { width: 300, height: 180 },
  annotation: { width: 260, height: 140 },
}

export function getNodeShape(node: ShapeNode): NodeShape | null {
  if (node.type === 'systemBox' || node.type === undefined) {
    return (node.data as SystemNodeData).displayMode ?? 'full'
  }
  if (node.type === 'infoCard' || node.type === 'annotation') return node.type
  return null
}

// Reuse identity, connections, parent, and position. Only presentation and the
// names of the visible text fields change; hidden content (including logos) survives.
export function convertNodeShape(node: ShapeNode, shape: NodeShape): ShapeNode {
  const current = getNodeShape(node)
  if (current === null || current === shape || !Object.hasOwn(NODE_SHAPE_SIZES, shape)) return node

  const { label, header, title, description, body, displayMode, ...shared } = node.data as
    Partial<SystemNodeData & InfoCardNodeData & AnnotationNodeData>
  const text = node.type === 'infoCard' ? header : node.type === 'annotation' ? title : label
  const detail = node.type === 'annotation' ? body : description
  const color = shared.color ?? '#334155'
  let data: ShapeNode['data']

  if (shape === 'annotation') {
    data = { ...shared, title: text ?? '', body: detail ?? '', color }
  } else if (shape === 'infoCard') {
    data = { ...shared, header: text ?? '', description: detail ?? '', color }
  } else {
    data = { ...shared, label: text ?? '', description: detail ?? '', color, displayMode: shape }
  }

  const size = NODE_SHAPE_SIZES[shape]
  return {
    ...node,
    type: shape === 'annotation' || shape === 'infoCard' ? shape : 'systemBox',
    data,
    ...size,
    // Measured dimensions may still describe the old shape until the next DOM
    // measurement. Keep the geometry used by edges and groups consistent now.
    measured: { ...size },
    ...(node.style ? { style: { ...node.style, ...size } } : {}),
  }
}
