import { z } from 'zod'
import type { DiagramFile, HandleCounts } from '../../src/types.js'

export const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() }).strict()
export const handlesSchema = z.object({
  top: z.number().int().min(1).max(4), right: z.number().int().min(1).max(4),
  bottom: z.number().int().min(1).max(4), left: z.number().int().min(1).max(4),
}).strict()
export const shapeSchema = z.enum(['full', 'logoOnly', 'textOnly', 'infoCard', 'annotation'])
export const speedSchema = z.enum(['real-time', 'near-real-time', 'batch', 'zero-copy', 'none'])
export const particleSchema = z.enum(['circle', 'cut-corner-rect'])
const id = z.string().min(1).max(200)
const text = z.string().max(100000)
const commonData = { color: z.string().max(200).optional(), icon: text.optional(), handleCounts: handlesSchema.optional() }
const dataSchema = z.object({
  ...commonData, label: text.optional(), header: text.optional(), title: text.optional(),
  description: text.optional(), body: text.optional(), displayMode: z.enum(['full', 'logoOnly', 'textOnly']).optional(),
}).strict()
export const diagramSchema = z.object({
  version: z.literal(1),
  nodes: z.array(z.object({
    id, type: z.enum(['systemBox', 'group', 'annotation', 'infoCard']), position: pointSchema,
    width: z.number().finite().positive().optional(), height: z.number().finite().positive().optional(),
    parentId: id.optional(), data: dataSchema,
  }).strict()).max(5000),
  edges: z.array(z.object({
    id, source: id, target: id, sourceHandle: id.nullable().optional(), targetHandle: id.nullable().optional(),
    data: z.object({ useCaseIds: z.array(id), label: text.optional() }).strict(),
  }).strict()).max(20000),
  useCases: z.array(z.object({ id, name: text, color: z.string(), speed: speedSchema, shape: particleSchema }).strict()).max(5000),
  scenarios: z.array(z.object({ id, name: text, useCaseIds: z.array(id) }).strict()).max(5000).optional(),
  showEdgeLabels: z.boolean().optional(), floatingEdges: z.boolean().optional(),
}).strict()

export function validateUseCases(content: DiagramFile, ids: string[]) {
  const known = new Set(content.useCases.map((item) => item.id))
  for (const id of ids) if (!known.has(id)) throw new Error(`Unknown useCaseId: ${id}`)
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate useCaseIds')
}

export function validateHandle(node: DiagramFile['nodes'][number], handle?: string | null) {
  if (handle == null) return
  const match = /^(top|right|bottom|left)(?:-([2-4]))?$/.exec(handle)
  const counts = node.data.handleCounts ?? { top: 1, right: 1, bottom: 1, left: 1 }
  if (!match || Number(match[2] ?? 1) > counts[match[1] as keyof HandleCounts]) {
    throw new Error(`Unknown handle ${handle} on node ${node.id}; update handleCounts first`)
  }
}

export function validateDiagram(content: DiagramFile): void {
  const unique = (ids: string[], kind: string) => {
    if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${kind} ids`)
  }
  unique(content.nodes.map((n) => n.id), 'node')
  unique(content.edges.map((n) => n.id), 'connection')
  unique(content.useCases.map((n) => n.id), 'use case')
  unique((content.scenarios ?? []).map((n) => n.id), 'scenario')
  const byId = new Map(content.nodes.map((n) => [n.id, n]))
  for (const node of content.nodes) {
    const data = node.data as Record<string, unknown>
    const required = node.type === 'infoCard' ? ['header', 'description'] : node.type === 'annotation' ? ['title'] : ['label']
    for (const field of required) if (typeof data[field] !== 'string') throw new Error(`Node ${node.id} requires ${field}`)
    if (node.type !== 'annotation' && typeof data.color !== 'string') throw new Error(`Node ${node.id} requires color`)
    const visited = new Set([node.id])
    let parentId = node.parentId
    while (parentId) {
      if (visited.has(parentId)) throw new Error(`Group cycle involving ${node.id}`)
      visited.add(parentId)
      const parent = byId.get(parentId)
      if (!parent || parent.type !== 'group') throw new Error(`Unknown group parentId: ${parentId}`)
      parentId = parent.parentId
    }
  }
  for (const edge of content.edges) {
    const source = byId.get(edge.source), target = byId.get(edge.target)
    if (!source || !target) throw new Error(`Unknown node in connection ${edge.id}`)
    validateHandle(source, edge.sourceHandle)
    validateHandle(target, edge.targetHandle)
    validateUseCases(content, edge.data.useCaseIds)
  }
  for (const scenario of content.scenarios ?? []) validateUseCases(content, scenario.useCaseIds)
}

export function parseDiagram(input: unknown): DiagramFile {
  const result = diagramSchema.parse(input) as DiagramFile
  validateDiagram(result)
  return result
}
