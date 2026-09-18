import type { DiagramFile, HandleCounts } from '../../src/types.js'
import type { ShapeNode } from '../../src/utils/nodeShape.js'
import { getNodeShape } from '../../src/utils/nodeShape.js'
import { absolutePositionOf, sortNodesByHierarchy } from '../../src/utils/nodeGrouping.js'
import { validateHandle, validateUseCases } from '../lib/diagramSchema.js'

export function documentNodes(nodes: ShapeNode[]): DiagramFile['nodes'] {
  return sortNodesByHierarchy(nodes).map((n) => ({
    id: n.id, type: n.type as DiagramFile['nodes'][number]['type'], position: n.position, data: n.data,
    ...(n.width !== undefined ? { width: n.width } : {}), ...(n.height !== undefined ? { height: n.height } : {}),
    ...(n.parentId ? { parentId: n.parentId } : {}),
  }))
}

export function requireNode(content: DiagramFile, id: string) {
  const node = content.nodes.find((n) => n.id === id)
  if (!node) throw new Error(`Unknown nodeId: ${id}`)
  return node
}

export function validateParent(content: DiagramFile, nodeId: string, parentId?: string | null) {
  const visited = new Set([nodeId])
  while (parentId) {
    if (visited.has(parentId)) throw new Error('A group cannot contain itself or its ancestor')
    visited.add(parentId)
    const parent = requireNode(content, parentId)
    if (parent.type !== 'group') throw new Error(`parentId ${parentId} is not a group`)
    parentId = parent.parentId
  }
}

export type NodePatch = {
  position?: { x: number; y: number }; parentId?: string | null; width?: number; height?: number
  label?: string; header?: string; description?: string; title?: string; body?: string
  color?: string; icon?: string; handleCounts?: HandleCounts
}

export function updateNode(content: DiagramFile, nodeId: string, patch: NodePatch) {
  const node = requireNode(content, nodeId)
  if (!Object.values(patch).some((value) => value !== undefined)) throw new Error('Provide at least one field to update')
  const byId = new Map(content.nodes.map((n) => [n.id, n]))
  const absolute = patch.position ?? absolutePositionOf(node, byId)
  const newParent = patch.parentId === undefined ? node.parentId : patch.parentId ?? undefined
  validateParent(content, nodeId, newParent)
  if (patch.parentId !== undefined || patch.position !== undefined) {
    const parent = newParent ? requireNode(content, newParent) : undefined
    const base = parent ? absolutePositionOf(parent, byId) : { x: 0, y: 0 }
    node.position = { x: absolute.x - base.x, y: absolute.y - base.y }
    if (newParent) node.parentId = newParent
    else delete node.parentId
  }
  const shape = getNodeShape(node)
  const minimum = node.type === 'group' || shape === 'infoCard' ? [240, node.type === 'group' ? 160 : 140]
    : shape === 'annotation' ? [160, 80] : shape === 'logoOnly' ? [90, 90] : [220, 110]
  if (patch.width !== undefined) {
    if (patch.width < minimum[0]) throw new Error(`Minimum width is ${minimum[0]}`)
    node.width = patch.width
  }
  if (patch.height !== undefined) {
    if (patch.height < minimum[1]) throw new Error(`Minimum height is ${minimum[1]}`)
    node.height = patch.height
  }
  const allowed = node.type === 'infoCard' ? ['header', 'description'] : node.type === 'annotation' ? ['title', 'body']
    : node.type === 'group' ? ['label'] : ['label', 'description']
  const data = node.data as Record<string, unknown>
  for (const field of ['label', 'header', 'description', 'title', 'body', 'color', 'icon', 'handleCounts'] as const) {
    const value = patch[field]
    if (value === undefined) continue
    if (!['color', 'icon', 'handleCounts'].includes(field) && !allowed.includes(field)) throw new Error(`Field ${field} is not editable on ${node.type}`)
    if (field === 'icon' && value === '') delete data.icon
    else data[field] = value
  }
  // Reducing counts must not silently orphan existing connections.
  if (patch.handleCounts) for (const edge of content.edges) {
    if (edge.source === nodeId) validateHandle(node, edge.sourceHandle)
    if (edge.target === nodeId) validateHandle(node, edge.targetHandle)
  }
  content.nodes = sortNodesByHierarchy(content.nodes)
}

export function validateConnection(content: DiagramFile, edge: DiagramFile['edges'][number]) {
  validateHandle(requireNode(content, edge.source), edge.sourceHandle)
  validateHandle(requireNode(content, edge.target), edge.targetHandle)
  validateUseCases(content, edge.data.useCaseIds)
}
