import { absolutePositionOf, nodeSize } from './nodeGrouping.js'
import { convertNodeShape, type ShapeNode } from './nodeShape.js'
import type { NodeShape } from '../types.js'

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom'
export type DistributeMode = 'horizontal' | 'vertical' | 'grid'

export function layoutNodes(nodes: ShapeNode[], ids: string[], mode: AlignMode | DistributeMode): ShapeNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const selected = new Set(ids)
  // A selected parent carries its subtree; do not move those children twice.
  const targets = nodes.filter((node) => {
    if (!selected.has(node.id)) return false
    let parent = node.parentId
    const visited = new Set<string>()
    while (parent && !visited.has(parent)) {
      if (selected.has(parent)) return false
      visited.add(parent)
      parent = byId.get(parent)?.parentId
    }
    return true
  })
  const distribute = ['horizontal', 'vertical', 'grid'].includes(mode)
  if (targets.length < (distribute ? 3 : 2)) return nodes
  const bounds = new Map(targets.map((n) => [n.id, { ...absolutePositionOf(n, byId), ...nodeSize(n) }]))
  const next = new Map<string, { x: number; y: number }>()
  const minX = Math.min(...[...bounds.values()].map((b) => b.x))
  const minY = Math.min(...[...bounds.values()].map((b) => b.y))
  if (mode === 'grid') {
    const columns = Math.max(1, Math.round(Math.sqrt(targets.length)))
    const width = Math.max(...[...bounds.values()].map((b) => b.width)) + 40
    const height = Math.max(...[...bounds.values()].map((b) => b.height)) + 40
    const sorted = [...targets].sort((a, b) => bounds.get(a.id)!.y - bounds.get(b.id)!.y || bounds.get(a.id)!.x - bounds.get(b.id)!.x)
    sorted.forEach((n, i) => next.set(n.id, { x: minX + (i % columns) * width, y: minY + Math.floor(i / columns) * height }))
  } else if (mode === 'horizontal' || mode === 'vertical') {
    const axis = mode === 'horizontal' ? 'x' : 'y'
    const size = mode === 'horizontal' ? 'width' : 'height'
    const sorted = [...targets].sort((a, b) => bounds.get(a.id)![axis] - bounds.get(b.id)![axis])
    const first = bounds.get(sorted[0].id)!, last = bounds.get(sorted.at(-1)!.id)!
    const total = sorted.reduce((sum, n) => sum + bounds.get(n.id)![size], 0)
    const gap = Math.max(40, (last[axis] + last[size] - first[axis] - total) / (sorted.length - 1))
    let cursor = first[axis]
    sorted.forEach((n) => {
      const b = bounds.get(n.id)!
      next.set(n.id, axis === 'x' ? { x: cursor, y: b.y } : { x: b.x, y: cursor })
      cursor += b[size] + gap
    })
  } else {
    const maxX = Math.max(...[...bounds.values()].map((b) => b.x + b.width))
    const maxY = Math.max(...[...bounds.values()].map((b) => b.y + b.height))
    for (const [id, b] of bounds) {
      let { x, y } = b
      if (mode === 'left') x = minX
      if (mode === 'hcenter') x = (minX + maxX - b.width) / 2
      if (mode === 'right') x = maxX - b.width
      if (mode === 'top') y = minY
      if (mode === 'vmiddle') y = (minY + maxY - b.height) / 2
      if (mode === 'bottom') y = maxY - b.height
      next.set(id, { x, y })
    }
  }
  return nodes.map((node) => {
    const position = next.get(node.id)
    if (!position) return node
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    const base = parent ? absolutePositionOf(parent, byId) : { x: 0, y: 0 }
    return { ...node, position: { x: position.x - base.x, y: position.y - base.y } }
  })
}

export function changeNodeShapeLayout(nodes: ShapeNode[], id: string, shape: NodeShape): ShapeNode[] {
  const original = nodes.find((node) => node.id === id)
  if (!original) return nodes
  const converted = convertNodeShape(original, shape)
  if (converted === original) return nodes
  const byId = new Map(nodes.map((node) => [node.id, node]))
  byId.set(id, converted)
  let parentId = converted.parentId
  const visited = new Set([id])
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    const parent = byId.get(parentId)
    if (!parent || parent.type !== 'group') break
    const children = [...byId.values()].filter((node) => node.parentId === parentId)
    const width = Math.max(nodeSize(parent).width, 240, ...children.map((child) => child.position.x + nodeSize(child).width + 40))
    const height = Math.max(nodeSize(parent).height, 160, ...children.map((child) => child.position.y + nodeSize(child).height + 60))
    byId.set(parentId, { ...parent, width, height, measured: { width, height }, ...(parent.style ? { style: { ...parent.style, width, height } } : {}) })
    parentId = parent.parentId
  }
  return nodes.map((node) => byId.get(node.id)!)
}
