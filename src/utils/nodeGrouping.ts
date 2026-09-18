import { getNodeShape, NODE_SHAPE_SIZES, type ShapeNode as SystemNode } from './nodeShape.js'

type HierarchyNode = { id: string; parentId?: string; position: { x: number; y: number } }

export function absolutePositionOf<T extends HierarchyNode>(node: T, byId: Map<string, T>) {
  const position = { ...node.position }
  const visited = new Set([node.id])
  let parentId = node.parentId
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    const parent = byId.get(parentId)
    if (!parent) break
    position.x += parent.position.x
    position.y += parent.position.y
    parentId = parent.parentId
  }
  return position
}

function ancestorsOf<T extends HierarchyNode>(node: T, byId: Map<string, T>): string[] {
  const ancestors: string[] = []
  const visited = new Set([node.id])
  let parentId = node.parentId
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    const parent = byId.get(parentId)
    if (!parent) break
    ancestors.push(parentId)
    parentId = parent.parentId
  }
  return ancestors
}

export function sortNodesByHierarchy<T extends HierarchyNode>(nodes: T[]): T[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const depths = new Map(nodes.map((node) => [node.id, ancestorsOf(node, byId).length]))
  return [...nodes].sort((a, b) => depths.get(a.id)! - depths.get(b.id)!)
}

export function nodeSize(node: SystemNode) {
  const fallback = node.type === 'group' ? { width: 400, height: 300 }
    : NODE_SHAPE_SIZES[getNodeShape(node) ?? 'full']
  return {
    width: node.measured?.width ?? node.width ?? fallback.width,
    height: node.measured?.height ?? node.height ?? fallback.height,
  }
}

// Preview and drop share the same rules. Resolve ties predictably: innermost,
// smallest, current parent, then the last rendered group at the same level.
export function findContainingGroup(
  nodes: SystemNode[],
  nodeId: string,
  position: { x: number; y: number },
  movingIds: Set<string> = new Set([nodeId]),
): SystemNode | undefined {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const node = byId.get(nodeId)
  if (!node) return undefined
  const absolute = absolutePositionOf({ ...node, position }, byId)
  const size = nodeSize(node)
  const candidates = nodes.flatMap((group, index) => {
    if (group.type !== 'group' || group.id === nodeId || movingIds.has(group.id)) return []
    const ancestors = ancestorsOf(group, byId)
    if (ancestors.includes(nodeId) || ancestors.some((id) => movingIds.has(id))) return []
    const bounds = { ...absolutePositionOf(group, byId), ...nodeSize(group) }
    if (absolute.x < bounds.x || absolute.y < bounds.y ||
      absolute.x + size.width > bounds.x + bounds.width ||
      absolute.y + size.height > bounds.y + bounds.height) return []
    return [{ group, depth: ancestors.length, area: bounds.width * bounds.height, index }]
  })
  candidates.sort((a, b) => b.depth - a.depth || a.area - b.area ||
    Number(b.group.id === node.parentId) - Number(a.group.id === node.parentId) || b.index - a.index)
  return candidates[0]?.group
}

export function resolveGroupDrop(nodes: SystemNode[], movingIds: Set<string>): SystemNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const resolved = nodes.map((node) => {
    if (!movingIds.has(node.id)) return node
    // Dragging a container carries its whole subtree; never reparent its children.
    if (ancestorsOf(node, byId).some((id) => movingIds.has(id))) return node
    const parent = findContainingGroup(nodes, node.id, node.position, movingIds)
    if (node.parentId === parent?.id) return node
    const absolute = absolutePositionOf(node, byId)
    const parentAbsolute = parent ? absolutePositionOf(parent, byId) : { x: 0, y: 0 }
    const { parentId: _parentId, extent: _extent, expandParent: _expandParent, ...rest } = node
    return {
      ...rest,
      ...(parent ? { parentId: parent.id } : {}),
      position: { x: absolute.x - parentAbsolute.x, y: absolute.y - parentAbsolute.y },
    }
  })
  return sortNodesByHierarchy(resolved)
}

// Explicit fit reframes the group, leaving every child's canvas position intact.
export function fitGroupContents(nodes: SystemNode[], groupId: string): SystemNode[] {
  const group = nodes.find((node) => node.id === groupId && node.type === 'group')
  const children = nodes.filter((node) => node.parentId === groupId)
  if (!group || children.length === 0) return nodes
  const left = Math.min(...children.map((node) => node.position.x)) - 40
  const top = Math.min(...children.map((node) => node.position.y)) - 60
  const right = Math.max(...children.map((node) => node.position.x + nodeSize(node).width)) + 40
  const bottom = Math.max(...children.map((node) => node.position.y + nodeSize(node).height)) + 40
  const width = Math.max(240, right - left)
  const height = Math.max(160, bottom - top)
  if (left === 0 && top === 0 && width === group.width && height === group.height) return nodes
  return nodes.map((node) => {
    if (node.id === groupId) return {
      ...node,
      position: { x: node.position.x + left, y: node.position.y + top },
      width, height, measured: { width, height },
      ...(node.style ? { style: { ...node.style, width, height } } : {}),
    }
    if (node.parentId === groupId) return {
      ...node, position: { x: node.position.x - left, y: node.position.y - top },
    }
    return node
  })
}
