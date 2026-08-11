import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { DiagramFile, ParticleShape, ParticleSpeed, UseCase } from '../../src/types.js'
import { signToken } from '../lib/jwt.js'
import { createDiagramsApi } from './apiClient.js'

const DEFAULT_NODE_COLOR = '#334155'
const DEFAULT_NODE_WIDTH = 220
const DEFAULT_NODE_HEIGHT = 110
const DEFAULT_GROUP_COLOR = '#475569'
const GROUP_WIDTH = 400
const GROUP_HEIGHT = 300
const GROUP_MIN_WIDTH = 240
const GROUP_MIN_HEIGHT = 160
const GROUP_CHILD_PADDING = 40
const GROUP_HEADER_PADDING = 60

const PARTICLE_SPEEDS: ParticleSpeed[] = ['real-time', 'near-real-time', 'batch', 'zero-copy', 'none']
const PARTICLE_SHAPES: ParticleShape[] = ['circle', 'cut-corner-rect']

function nextId(prefix: string) {
  return `${prefix}-${randomUUID()}`
}

function absolutePositionOfNode(
  node: DiagramFile['nodes'][number],
  byId: Map<string, DiagramFile['nodes'][number]>,
): { x: number; y: number } {
  if (!node.parentId) return node.position
  const parent = byId.get(node.parentId)
  if (!parent) return node.position
  const parentAbs = absolutePositionOfNode(parent, byId)
  return { x: parentAbs.x + node.position.x, y: parentAbs.y + node.position.y }
}

function isInsideBounds(
  node: { x: number; y: number; width: number; height: number },
  bounds: { x: number; y: number; width: number; height: number },
) {
  return (
    node.x >= bounds.x &&
    node.y >= bounds.y &&
    node.x + node.width <= bounds.x + bounds.width &&
    node.y + node.height <= bounds.y + bounds.height
  )
}

function fitGroupToChildren(
  children: Array<{ position: { x: number; y: number }; width?: number; height?: number; type?: string }>,
): { width: number; height: number } | null {
  if (children.length === 0) return null

  let maxX = -Infinity
  let maxY = -Infinity

  for (const child of children) {
    const width = child.width ?? (child.type === 'group' ? GROUP_WIDTH : DEFAULT_NODE_WIDTH)
    const height = child.height ?? (child.type === 'group' ? GROUP_HEIGHT : DEFAULT_NODE_HEIGHT)
    maxX = Math.max(maxX, child.position.x + width)
    maxY = Math.max(maxY, child.position.y + height)
  }

  return {
    width: Math.max(GROUP_MIN_WIDTH, maxX + GROUP_CHILD_PADDING),
    height: Math.max(GROUP_MIN_HEIGHT, maxY + GROUP_HEADER_PADDING),
  }
}

export function buildMcpServer(user: { userId: string; email: string }) {
  const sessionToken = signToken({ sub: user.userId, email: user.email }, '5m')
  const diagramsApi = createDiagramsApi(sessionToken)

  async function mutateDiagram(diagramId: string, mutate: (content: DiagramFile) => void) {
    const diagram = await diagramsApi.get(diagramId)
    mutate(diagram.content)
    return diagramsApi.update(diagramId, { content: diagram.content })
  }

  const server = new McpServer({ name: 'architectures-mcp-server', version: '0.1.0' })

  server.registerTool(
    'list_diagrams',
    {
      title: 'List diagrams',
      description:
        'List all diagrams owned by the authenticated user, each with a content summary (system/group/connection counts, use case names, and top-level system names). ' +
        'Call this FIRST whenever the user asks to design a new architecture, to check whether an existing diagram already models a similar system, integration, or use case you can reuse as a reference pattern instead of starting from scratch. ' +
        'If a summary looks relevant (shares systems, use cases, or a similar shape), call get_diagram on it before creating anything new.',
      inputSchema: {},
    },
    async () => {
      const diagrams = await diagramsApi.list()
      return { content: [{ type: 'text', text: JSON.stringify(diagrams, null, 2) }] }
    },
  )

  server.registerTool(
    'get_design_guide',
    {
      title: 'Get design guide',
      description:
        'Read this before designing a new architecture or adding to an existing one. Explains the modeling vocabulary (systems, groups, use cases, connections) and when to use each.',
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: 'text',
          text: [
            'DESIGN GUIDE',
            '',
            '- System (create_system): a single, independently deployable/logical component — an app, a service, a database, a platform. Use one system box per component that a reader would think of as "one thing".',
            '',
            '- Group (create_group): a *container* representing a larger system that is actually composed of several smaller systems worth showing individually. Use a group instead of one big system box whenever the sub-systems inside it have their own identity, their own connections to things outside the group, or their own use cases. Create the group first, then create child systems with parentId set to the group id.',
            '  Example: "an e-commerce platform with a catalog service, a checkout service, and an order database" -> create_group("E-commerce platform"), then three create_system calls with parentId set to that group, NOT one system box labeled "E-commerce platform".',
            '  Counter-example: "a single Postgres database used by one service" -> just one system box. Do not create a group for something with no internally-distinguishable parts.',
            '',
            '- Use case (set_use_case): a named *kind* of interaction (e.g. "Checkout", "Nightly sync", "Read replica traffic") with its own color/speed/shape, reused across every connection that represents that same kind of interaction. Call set_use_case once per distinct kind of interaction in the architecture, then reference its id from every relevant create_connection call. Do not create a new use case per connection if the same kind of interaction already exists — reuse it by name.',
            '',
            '- Connection (create_connection): an edge between two systems (or between a system and a group, or two groups). A connection does not need a use case — pass no useCaseIds for a plain structural link. Pass useCaseIds when the connection represents one or more of the named interactions above.',
            '',
            'Typical structures:',
            '  - A platform with internal modules -> one group with several child systems (parentId), connections between children and to external systems as needed.',
            '  - A one-off integration between two independent products -> two plain systems connected directly, no group needed.',
            '  - A shared interaction pattern (e.g. many services all writing to one audit log) -> one use case named "Audit log write", reused across every connection into that system.',
          ].join('\n'),
        },
      ],
    }),
  )

  server.registerTool(
    'create_diagram',
    {
      title: 'Create diagram',
      description: 'Create a new, empty diagram and return its id.',
      inputSchema: { name: z.string().trim().min(1).max(200) },
    },
    async ({ name }) => {
      const diagram = await diagramsApi.create(name)
      return { content: [{ type: 'text', text: JSON.stringify(diagram, null, 2) }] }
    },
  )

  server.registerTool(
    'get_diagram',
    {
      title: 'Get diagram',
      description: 'Fetch a diagram by id, including its full content (nodes, edges, use cases, scenarios).',
      inputSchema: { diagramId: z.string().min(1) },
    },
    async ({ diagramId }) => {
      const diagram = await diagramsApi.get(diagramId)
      return { content: [{ type: 'text', text: JSON.stringify(diagram, null, 2) }] }
    },
  )

  server.registerTool(
    'rename_diagram',
    {
      title: 'Rename diagram',
      description: 'Rename a diagram.',
      inputSchema: { diagramId: z.string().min(1), name: z.string().trim().min(1).max(200) },
    },
    async ({ diagramId, name }) => {
      const diagram = await diagramsApi.update(diagramId, { name })
      return { content: [{ type: 'text', text: JSON.stringify(diagram, null, 2) }] }
    },
  )

  server.registerTool(
    'create_system',
    {
      title: 'Create system box',
      description:
        'Add a new system box node to a diagram. A system represents a single, independently deployable/logical component (an app, a service, a database, a platform) — one box per component a reader would think of as "one thing". ' +
        'If the thing you are modeling is actually composed of several smaller systems that each deserve their own box (their own connections, their own use cases), do NOT model it as one system box — use create_group instead and create the sub-systems as children via parentId. ' +
        'Pass parentId (a group node id) to nest this system inside an existing group. Returns the new node id.',
      inputSchema: {
        diagramId: z.string().min(1),
        label: z.string().trim().min(1),
        color: z.string().optional(),
        position: z.object({ x: z.number(), y: z.number() }).optional(),
        displayMode: z.enum(['full', 'logoOnly', 'textOnly']).optional(),
        parentId: z.string().optional(),
      },
    },
    async ({ diagramId, label, color, position, displayMode, parentId }) => {
      const nodeId = nextId('node')
      await mutateDiagram(diagramId, (content) => {
        let parent: DiagramFile['nodes'][number] | undefined
        if (parentId !== undefined) {
          parent = content.nodes.find((n) => n.id === parentId)
          if (!parent) throw new Error(`Unknown parentId: ${parentId}`)
          if (parent.type !== 'group') throw new Error(`parentId ${parentId} is not a group node`)
        }
        content.nodes.push({
          id: nodeId,
          type: 'systemBox',
          position: position ?? { x: 0, y: 0 },
          width: DEFAULT_NODE_WIDTH,
          height: DEFAULT_NODE_HEIGHT,
          ...(parentId !== undefined ? { parentId } : {}),
          data: {
            label,
            color: color ?? DEFAULT_NODE_COLOR,
            ...(displayMode && displayMode !== 'full' ? { displayMode } : {}),
          },
        })
        if (parent) {
          const byId = new Map(content.nodes.map((n) => [n.id, n]))
          const parentAbs = absolutePositionOfNode(parent, byId)
          const parentWidth = parent.width ?? GROUP_WIDTH
          const parentHeight = parent.height ?? GROUP_HEIGHT

          const children = content.nodes
            .filter((n) => n.id !== parent!.id)
            .map((n) => {
              const abs = absolutePositionOfNode(n, byId)
              const width = n.width ?? (n.type === 'group' ? GROUP_WIDTH : DEFAULT_NODE_WIDTH)
              const height = n.height ?? (n.type === 'group' ? GROUP_HEIGHT : DEFAULT_NODE_HEIGHT)
              return { node: n, abs, width, height }
            })
            .filter(
              ({ node, abs, width, height }) =>
                node.parentId === parent!.id ||
                isInsideBounds({ ...abs, width, height }, { ...parentAbs, width: parentWidth, height: parentHeight }),
            )
            .map(({ abs, width, height }) => ({
              position: { x: abs.x - parentAbs.x, y: abs.y - parentAbs.y },
              width,
              height,
            }))

          const fitted = fitGroupToChildren(children)
          if (fitted) {
            parent.width = fitted.width
            parent.height = fitted.height
          }
        }
      })
      return { content: [{ type: 'text', text: JSON.stringify({ nodeId }, null, 2) }] }
    },
  )

  server.registerTool(
    'create_group',
    {
      title: 'Create group box',
      description:
        'Add a new group container node to a diagram. A group represents a larger system that is actually composed of several smaller systems worth showing individually — create the group first, then create its child systems with create_system passing this group\'s id as parentId. ' +
        'Do not use a group for something with no internally-distinguishable parts (that\'s just a plain system). Returns the new node id.',
      inputSchema: {
        diagramId: z.string().min(1),
        label: z.string().trim().min(1),
        color: z.string().optional(),
        position: z.object({ x: z.number(), y: z.number() }).optional(),
      },
    },
    async ({ diagramId, label, color, position }) => {
      const nodeId = nextId('node')
      await mutateDiagram(diagramId, (content) => {
        content.nodes.push({
          id: nodeId,
          type: 'group',
          position: position ?? { x: 0, y: 0 },
          width: GROUP_WIDTH,
          height: GROUP_HEIGHT,
          data: {
            label,
            color: color ?? DEFAULT_GROUP_COLOR,
          },
        })
      })
      return { content: [{ type: 'text', text: JSON.stringify({ nodeId }, null, 2) }] }
    },
  )

  server.registerTool(
    'create_connection',
    {
      title: 'Create connection',
      description:
        'Connect two system boxes (or groups) with an edge. A connection does not need a use case — omit useCaseIds for a plain structural link. ' +
        'Pass useCaseIds when this edge represents one or more named kinds of interaction created via set_use_case (e.g. "Checkout", "Nightly sync") — reuse an existing use case id by name rather than creating a duplicate. Returns the new edge id.',
      inputSchema: {
        diagramId: z.string().min(1),
        sourceSystemId: z.string().min(1),
        targetSystemId: z.string().min(1),
        useCaseIds: z.array(z.string()).optional(),
        label: z.string().optional(),
      },
    },
    async ({ diagramId, sourceSystemId, targetSystemId, useCaseIds, label }) => {
      const edgeId = nextId('edge')
      await mutateDiagram(diagramId, (content) => {
        const sourceExists = content.nodes.some((n) => n.id === sourceSystemId)
        const targetExists = content.nodes.some((n) => n.id === targetSystemId)
        if (!sourceExists || !targetExists) {
          throw new Error(
            `Unknown node id(s): ${[!sourceExists && sourceSystemId, !targetExists && targetSystemId].filter(Boolean).join(', ')}`,
          )
        }
        content.edges.push({
          id: edgeId,
          source: sourceSystemId,
          target: targetSystemId,
          data: { useCaseIds: useCaseIds ?? [], ...(label ? { label } : {}) },
        })
      })
      return { content: [{ type: 'text', text: JSON.stringify({ edgeId }, null, 2) }] }
    },
  )

  server.registerTool(
    'set_use_case',
    {
      title: 'Create or update use case',
      description:
        'Create a use case by name, or update it if a use case with that name already exists. A use case is a named *kind* of interaction (e.g. "Checkout", "Nightly sync", "Read replica traffic") with its own color/speed/shape, reused across every connection that represents that same kind of interaction. ' +
        'Call this once per distinct kind of interaction, then reference its id from every relevant create_connection call — do not create a new use case per connection if the same kind of interaction already exists. Returns the use case id.',
      inputSchema: {
        diagramId: z.string().min(1),
        name: z.string().trim().min(1),
        color: z.string(),
        speed: z.enum(PARTICLE_SPEEDS as [ParticleSpeed, ...ParticleSpeed[]]),
        shape: z.enum(PARTICLE_SHAPES as [ParticleShape, ...ParticleShape[]]),
      },
    },
    async ({ diagramId, name, color, speed, shape }) => {
      let useCaseId = ''
      await mutateDiagram(diagramId, (content) => {
        const existing = content.useCases.find((uc) => uc.name === name)
        if (existing) {
          existing.color = color
          existing.speed = speed
          existing.shape = shape
          useCaseId = existing.id
          return
        }
        const useCase: UseCase = { id: nextId('usecase'), name, color, speed, shape }
        content.useCases.push(useCase)
        useCaseId = useCase.id
      })
      return { content: [{ type: 'text', text: JSON.stringify({ useCaseId }, null, 2) }] }
    },
  )

  return server
}
