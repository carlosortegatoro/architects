import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { DiagramFile, InfoCardNodeData, ParticleShape, ParticleSpeed, UseCase } from '../../src/types.js'
import { signToken } from '../lib/jwt.js'
import { createDiagramsApi } from './apiClient.js'
import { registerExtendedTools } from './extendedTools.js'
import { documentNodes, updateNode, validateConnection, validateParent } from './editing.js'
import { handlesSchema, pointSchema, validateDiagram } from '../lib/diagramSchema.js'
import { NODE_SHAPE_SIZES } from '../../src/utils/nodeShape.js'
import { absolutePositionOf as absolutePositionOfNode } from '../../src/utils/nodeGrouping.js'

const DEFAULT_NODE_COLOR = '#334155'
const DEFAULT_GROUP_COLOR = '#475569'
const GROUP_WIDTH = 400
const GROUP_HEIGHT = 300
const DEFAULT_INFO_CARD_COLOR = '#2563eb'
const INFO_CARD_WIDTH = 300
const INFO_CARD_HEIGHT = 180

const PARTICLE_SPEEDS: ParticleSpeed[] = ['real-time', 'near-real-time', 'batch', 'zero-copy', 'none']
const PARTICLE_SHAPES: ParticleShape[] = ['circle', 'cut-corner-rect']

function nextId(prefix: string) {
  return `${prefix}-${randomUUID()}`
}

function attachToParent(content: DiagramFile, node: DiagramFile['nodes'][number], parentId?: string) {
  validateParent(content, node.id, parentId)
  // Match the UI: creating/attaching a child never implicitly resizes its group.
  content.nodes = documentNodes(content.nodes)
}

export function buildMcpServer(user: { userId: string; email: string; authVersion: number }) {
  const sessionToken = signToken({ sub: user.userId, email: user.email, ver: user.authVersion }, '5m')
  const diagramsApi = createDiagramsApi(sessionToken)

  async function mutateDiagram(diagramId: string, mutate: (content: DiagramFile) => void) {
    const diagram = await diagramsApi.get(diagramId)
    mutate(diagram.content)
    diagram.content.nodes = documentNodes(diagram.content.nodes)
    validateDiagram(diagram.content)
    return diagramsApi.update(diagramId, { content: diagram.content, expectedRevision: diagram.revision, recordHistory: true })
  }

  const server = new McpServer({ name: 'architectures-mcp-server', version: '0.1.0' })

  server.registerTool(
    'list_diagrams',
    {
      title: 'List diagrams',
      description:
        'List all diagrams owned by the authenticated user, each with a content summary (system/group/information-card/annotation/connection counts, scenario and use case names, and top-level node names). ' +
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
        'Read this before designing a new architecture or adding to an existing one. Explains the modeling vocabulary (systems, groups, information cards, annotations, use cases, and connections) and when to use each.',
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
            '  Groups can nest: pass parentId (another group id) to create_group itself to model a group-within-a-group. Example: "a platform with a data layer that has its own cache and primary database" -> create_group("Platform"), create_group("Data layer", parentId: platformId), then create_system("Cache", parentId: dataLayerId) and create_system("Primary DB", parentId: dataLayerId).',
            '',
            '- Information card (create_info_card): a connectable card with a logo, header, and multiline description. Use it for a product, capability, external actor, or explanatory concept that needs visible context but is not best represented as a plain system or as a container. It can be nested in a group and connected to any other diagram node.',
            '',
            '- Annotation (create_annotation / update_node): a connectable free-form title/body note. Use create_info_card instead when a visible logo and structured header/description are appropriate.',
            '',
            '- Editing: update_node edits any existing node, moves/resizes it, changes its group (parentId:null detaches), and configures handleCounts. Its position is ABSOLUTE canvas coordinates; creation positions are RELATIVE to parentId when given. Omitting position while changing parent keeps the node fixed on the canvas. Groups never auto-resize when adding/moving children: call fit_group explicitly.',
            '- change_node_shape converts boxes without losing IDs/connections/hidden content. align_nodes and distribute_nodes use the same geometry as the UI. Group deletion promotes direct children to the ROOT, preserving canvas positions.',
            '- Scenarios: list_scenarios, create_scenario, update_scenario and delete_scenario manage saved selections of cases of use. They do not activate a presentation in a browser.',
            '- Edit connections via update_connection; edit/rename cases of use by stable ID via update_use_case. Configure endpoints using sourceHandle/targetHandle (top/right/bottom/left, side-2 through side-4 as enabled).',
            '- Documents: set_diagram_options, import_diagram (new document by default, confirmed undoable replacement when diagramId is provided), export_diagram, duplicate_diagram. delete_diagram is permanent and requires explicit confirmation and the exact current name.',
            '- Sharing: list_share_links/create_share_link/revoke_share_link. Public links require explicit permission to share and a duration; URLs are sensitive.',
            '- History: get_diagram_history, undo_diagram_change and redo_diagram_change work across requests for up to 50 MCP document edits. A subsequent UI edit clears MCP history; sharing and whole-diagram deletion are not undoable. Concurrent changes return an error: read the diagram again before retrying.',
            '- Browser-only controls are not remote MCP operations: active presentation scenario, fullscreen, zoom/pan, pointer, highlights, animation pause, theme and local keyboard undo. This server edits stored documents, not a specific browser session.',
            '',
            '- Use case (set_use_case): a named *kind* of interaction (e.g. "Checkout", "Nightly sync", "Read replica traffic") with its own color/speed/shape, reused across every connection that represents that same kind of interaction. Call set_use_case once per distinct kind of interaction in the architecture, then reference its id from every relevant create_connection call. Do not create a new use case per connection if the same kind of interaction already exists — reuse it by name.',
            '',
            '- Connection (create_connection): an edge between any two diagram nodes: systems, groups, information cards, or annotations. A connection does not need a use case — pass no useCaseIds for a plain structural link. Pass useCaseIds when the connection represents one or more of the named interactions above.',
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
      const current = await diagramsApi.get(diagramId)
      const diagram = await diagramsApi.update(diagramId, { name, expectedRevision: current.revision, recordHistory: true })
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
        'Pass parentId to nest inside an existing group; position is then relative to that group, otherwise absolute. No implicit group resize; use fit_group. Returns the new node id.',
      inputSchema: {
        diagramId: z.string().min(1),
        label: z.string().trim().min(1),
        color: z.string().optional(),
        position: pointSchema.optional(),
        width: z.number().finite().positive().optional(), height: z.number().finite().positive().optional(), handleCounts: handlesSchema.optional(),
        displayMode: z.enum(['full', 'logoOnly', 'textOnly']).optional(),
        parentId: z.string().optional(),
        icon: z.string().trim().min(1).optional(),
      },
    },
    async ({ diagramId, label, color, position, displayMode, parentId, icon, width, height, handleCounts }) => {
      const nodeId = nextId('node')
      await mutateDiagram(diagramId, (content) => {
        const node: DiagramFile['nodes'][number] = {
          id: nodeId,
          type: 'systemBox',
          position: position ?? { x: 0, y: 0 },
          ...NODE_SHAPE_SIZES[displayMode ?? 'full'],
          ...(parentId !== undefined ? { parentId } : {}),
          data: {
            label,
            color: color ?? DEFAULT_NODE_COLOR,
            ...(displayMode && displayMode !== 'full' ? { displayMode } : {}),
            ...(icon ? { icon } : {}),
            ...(handleCounts ? { handleCounts } : {}),
          },
        }
        content.nodes.push(node)
        if (width !== undefined || height !== undefined) updateNode(content, node.id, { width, height })
        attachToParent(content, node, parentId)
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
        'Do not use a group for something with no internally-distinguishable parts (that\'s just a plain system). ' +
        'Pass parentId (another group node id) to nest this group inside an existing group — groups can be nested arbitrarily deep, e.g. a "Platform" group containing a "Data layer" group which itself contains a "Cache" group. Returns the new node id.',
      inputSchema: {
        diagramId: z.string().min(1),
        label: z.string().trim().min(1),
        color: z.string().optional(),
        position: pointSchema.optional(),
        width: z.number().finite().positive().optional(), height: z.number().finite().positive().optional(), handleCounts: handlesSchema.optional(),
        parentId: z.string().optional(),
        icon: z.string().trim().min(1).optional(),
      },
    },
    async ({ diagramId, label, color, position, parentId, icon, width, height, handleCounts }) => {
      const nodeId = nextId('node')
      await mutateDiagram(diagramId, (content) => {
        const node: DiagramFile['nodes'][number] = {
          id: nodeId,
          type: 'group',
          position: position ?? { x: 0, y: 0 },
          width: GROUP_WIDTH,
          height: GROUP_HEIGHT,
          ...(parentId !== undefined ? { parentId } : {}),
          data: {
            label,
            color: color ?? DEFAULT_GROUP_COLOR,
            ...(icon ? { icon } : {}),
            ...(handleCounts ? { handleCounts } : {}),
          },
        }
        content.nodes.push(node)
        if (width !== undefined || height !== undefined) updateNode(content, node.id, { width, height })
        attachToParent(content, node, parentId)
      })
      return { content: [{ type: 'text', text: JSON.stringify({ nodeId }, null, 2) }] }
    },
  )

  server.registerTool(
    'create_info_card',
    {
      title: 'Create information card',
      description:
        'Add a connectable information card with a logo, header, and multiline description. ' +
        'Use it for products, capabilities, external actors, or explanatory concepts that need more visible context than a plain system box. ' +
        'It can connect to systems, groups, annotations, and other information cards. Pass parentId to nest it inside a group. Returns the new node id.',
      inputSchema: {
        diagramId: z.string().min(1),
        header: z.string().trim().min(1).max(200),
        description: z.string().max(4000),
        color: z.string().optional(),
        position: pointSchema.optional(),
        width: z.number().finite().positive().optional(), height: z.number().finite().positive().optional(), handleCounts: handlesSchema.optional(),
        parentId: z.string().optional(),
        icon: z.string().trim().min(1).optional(),
      },
    },
    async ({ diagramId, header, description, color, position, parentId, icon, width, height, handleCounts }) => {
      const nodeId = nextId('info-card')
      await mutateDiagram(diagramId, (content) => {
        const node: DiagramFile['nodes'][number] = {
          id: nodeId,
          type: 'infoCard',
          position: position ?? { x: 0, y: 0 },
          width: INFO_CARD_WIDTH,
          height: INFO_CARD_HEIGHT,
          ...(parentId !== undefined ? { parentId } : {}),
          data: {
            header,
            description,
            color: color ?? DEFAULT_INFO_CARD_COLOR,
            ...(icon ? { icon } : {}),
            ...(handleCounts ? { handleCounts } : {}),
          },
        }
        content.nodes.push(node)
        if (width !== undefined || height !== undefined) updateNode(content, node.id, { width, height })
        attachToParent(content, node, parentId)
      })
      return { content: [{ type: 'text', text: JSON.stringify({ nodeId }, null, 2) }] }
    },
  )

  server.registerTool(
    'update_info_card',
    {
      title: 'Update information card',
      description:
        'Update the header, description, color, or logo of an existing information card. ' +
        'Pass icon as an empty string to remove its logo.',
      inputSchema: {
        diagramId: z.string().min(1),
        nodeId: z.string().min(1),
        header: z.string().trim().min(1).max(200).optional(),
        description: z.string().max(4000).optional(),
        color: z.string().optional(),
        icon: z.string().optional(),
      },
    },
    async ({ diagramId, nodeId, header, description, color, icon }) => {
      if (header === undefined && description === undefined && color === undefined && icon === undefined) {
        throw new Error('Provide at least one information-card field to update')
      }
      await mutateDiagram(diagramId, (content) => {
        const node = content.nodes.find((candidate) => candidate.id === nodeId)
        if (!node) throw new Error(`Unknown nodeId: ${nodeId}`)
        if (node.type !== 'infoCard') throw new Error(`Node ${nodeId} is not an information card`)

        const data = node.data as InfoCardNodeData
        if (header !== undefined) data.header = header
        if (description !== undefined) data.description = description
        if (color !== undefined) data.color = color
        if (icon === '') delete data.icon
        else if (icon !== undefined) data.icon = icon
      })
      return { content: [{ type: 'text', text: JSON.stringify({ nodeId }, null, 2) }] }
    },
  )

  server.registerTool(
    'create_connection',
    {
      title: 'Create connection',
      description:
        'Connect any two diagram nodes (systems, groups, information cards, or annotations) with an edge. A connection does not need a use case — omit useCaseIds for a plain structural link. ' +
        'Pass useCaseIds when this edge represents one or more named kinds of interaction created via set_use_case (e.g. "Checkout", "Nightly sync") — reuse an existing use case id by name rather than creating a duplicate. Returns the new edge id.',
      inputSchema: {
        diagramId: z.string().min(1),
        sourceSystemId: z.string().min(1),
        targetSystemId: z.string().min(1),
        sourceHandle: z.string().nullable().optional(),
        targetHandle: z.string().nullable().optional(),
        useCaseIds: z.array(z.string()).optional(),
        label: z.string().optional(),
      },
    },
    async ({ diagramId, sourceSystemId, targetSystemId, sourceHandle, targetHandle, useCaseIds, label }) => {
      const edgeId = nextId('edge')
      await mutateDiagram(diagramId, (content) => {
        const sourceExists = content.nodes.some((n) => n.id === sourceSystemId)
        const targetExists = content.nodes.some((n) => n.id === targetSystemId)
        if (!sourceExists || !targetExists) {
          throw new Error(
            `Unknown node id(s): ${[!sourceExists && sourceSystemId, !targetExists && targetSystemId].filter(Boolean).join(', ')}`,
          )
        }
        const edge: DiagramFile['edges'][number] = {
          id: edgeId,
          source: sourceSystemId,
          target: targetSystemId,
          ...(sourceHandle !== undefined ? { sourceHandle } : {}),
          ...(targetHandle !== undefined ? { targetHandle } : {}),
          data: { useCaseIds: useCaseIds ?? [], ...(label ? { label } : {}) },
        }
        validateConnection(content, edge)
        content.edges.push(edge)
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

  server.registerTool(
    'set_icon',
    {
      title: 'Set node icon',
      description:
        'Set or change the logo/icon of an existing system, group, or information-card node, using an external image URL or preset:<slug>. ' +
        'Pass icon as an empty string to remove the current icon.',
      inputSchema: { diagramId: z.string().min(1), nodeId: z.string().min(1), icon: z.string() },
    },
    async ({ diagramId, nodeId, icon }) => {
      await mutateDiagram(diagramId, (content) => {
        const node = content.nodes.find((n) => n.id === nodeId)
        if (!node) throw new Error(`Unknown nodeId: ${nodeId}`)
        if (icon === '') delete (node.data as { icon?: string }).icon
        else (node.data as { icon?: string }).icon = icon
      })
      return { content: [{ type: 'text', text: JSON.stringify({ nodeId, icon: icon || null }, null, 2) }] }
    },
  )

  server.registerTool(
    'delete_node',
    {
      title: 'Delete node',
      description:
        'Delete any node from a diagram. Connections to/from it are deleted too. ' +
        "If it's a group, direct children are promoted to the diagram ROOT (including for nested groups), keeping absolute canvas positions and their own subtrees. Matches the editor UI; undo_diagram_change can restore the deletion.",
      inputSchema: { diagramId: z.string().min(1), nodeId: z.string().min(1) },
    },
    async ({ diagramId, nodeId }) => {
      await mutateDiagram(diagramId, (content) => {
        const byId = new Map(content.nodes.map((n) => [n.id, n]))
        const removed = byId.get(nodeId)
        if (!removed) throw new Error(`Unknown nodeId: ${nodeId}`)
        const removedAbs = absolutePositionOfNode(removed, byId)
        const isGroup = removed.type === 'group'

        content.nodes = content.nodes
          .filter((n) => n.id !== nodeId)
          .map((n) => {
            if (!isGroup || n.parentId !== nodeId) return n
            const { parentId, ...rest } = n
            return { ...rest, position: { x: removedAbs.x + n.position.x, y: removedAbs.y + n.position.y } }
          })
        content.edges = content.edges.filter((e) => e.source !== nodeId && e.target !== nodeId)
      })
      return { content: [{ type: 'text', text: JSON.stringify({ deleted: nodeId }, null, 2) }] }
    },
  )

  server.registerTool(
    'delete_connection',
    {
      title: 'Delete connection',
      description: 'Delete an edge (connection) from a diagram by its id.',
      inputSchema: { diagramId: z.string().min(1), edgeId: z.string().min(1) },
    },
    async ({ diagramId, edgeId }) => {
      await mutateDiagram(diagramId, (content) => {
        if (!content.edges.some((e) => e.id === edgeId)) throw new Error(`Unknown edgeId: ${edgeId}`)
        content.edges = content.edges.filter((e) => e.id !== edgeId)
      })
      return { content: [{ type: 'text', text: JSON.stringify({ deleted: edgeId }, null, 2) }] }
    },
  )

  server.registerTool(
    'delete_use_case',
    {
      title: 'Delete use case',
      description: 'Delete a use case by id. Connections/scenarios referencing it keep existing but lose the reference.',
      inputSchema: { diagramId: z.string().min(1), useCaseId: z.string().min(1) },
    },
    async ({ diagramId, useCaseId }) => {
      await mutateDiagram(diagramId, (content) => {
        if (!content.useCases.some((u) => u.id === useCaseId)) throw new Error(`Unknown useCaseId: ${useCaseId}`)
        content.useCases = content.useCases.filter((u) => u.id !== useCaseId)
        content.edges = content.edges.map((e) => ({
          ...e,
          data: { ...e.data, useCaseIds: e.data.useCaseIds.filter((id) => id !== useCaseId) },
        }))
        content.scenarios = (content.scenarios ?? []).map((s) => ({
          ...s,
          useCaseIds: s.useCaseIds.filter((id) => id !== useCaseId),
        }))
      })
      return { content: [{ type: 'text', text: JSON.stringify({ deleted: useCaseId }, null, 2) }] }
    },
  )

  registerExtendedTools(server, diagramsApi, mutateDiagram)
  return server
}
