import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { DiagramFile } from '../../src/types.js'
import { fitGroupContents } from '../../src/utils/nodeGrouping.js'
import { changeNodeShapeLayout, layoutNodes } from '../../src/utils/nodeLayout.js'
import { diagramSchema, handlesSchema, parseDiagram, particleSchema, pointSchema, shapeSchema, speedSchema, validateUseCases } from '../lib/diagramSchema.js'
import type { createDiagramsApi } from './apiClient.js'
import { documentNodes, requireNode, updateNode, validateConnection, validateParent } from './editing.js'

type Api = ReturnType<typeof createDiagramsApi>
type Mutate = (id: string, fn: (content: DiagramFile) => void) => Promise<unknown>
const id = z.string().min(1).max(200)
const name = z.string().trim().min(1).max(200)
const finiteSize = z.number().finite().positive()
const diagramId = { diagramId: id }
const nodeId = { ...diagramId, nodeId: id }

export function registerExtendedTools(server: McpServer, api: Api, mutate: Mutate) {
  function tool<S extends z.ZodRawShape>(
    toolName: string, description: string, schema: S,
    run: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>,
    annotations: { readOnlyHint?: boolean; destructiveHint?: boolean; openWorldHint?: boolean } = {},
  ) {
    server.registerTool(toolName, {
      title: toolName.replaceAll('_', ' '), description, inputSchema: schema as z.ZodRawShape,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, ...annotations },
    }, async (args) => ({ content: [{ type: 'text' as const, text: JSON.stringify(await run(args as z.infer<z.ZodObject<S>>), null, 2) }] }))
  }

  tool('create_annotation', 'Create a connectable note. Position is relative to parentId when provided, otherwise absolute. Groups do not auto-resize; call fit_group explicitly.', {
    ...diagramId, title: name, body: z.string().max(100000).optional(), color: z.string().optional(),
    position: pointSchema.optional(), parentId: id.optional(), width: finiteSize.optional(), height: finiteSize.optional(), handleCounts: handlesSchema.optional(),
  }, async ({ diagramId, title, body, color, position, parentId, width, height, handleCounts }) => {
    const newId = `annotation-${randomUUID()}`
    await mutate(diagramId, (content) => {
      validateParent(content, newId, parentId)
      content.nodes.push({ id: newId, type: 'annotation', position: position ?? { x: 0, y: 0 },
        width: 260, height: 140, ...(parentId ? { parentId } : {}),
        data: { title, body: body ?? '', ...(color ? { color } : {}), ...(handleCounts ? { handleCounts } : {}) } })
      if (width !== undefined || height !== undefined) updateNode(content, newId, { width, height })
    })
    return { nodeId: newId }
  })

  tool('update_node', 'Edit any existing node without changing its ID/connections. Position is ABSOLUTE canvas coordinates. parentId changes membership; null detaches to root, omission keeps the parent. Changing parent without position preserves absolute position. Groups never auto-resize. Use visible text fields for its type: label (system/group), header/description (card), title/body (note). Empty icon removes it. Reducing handleCounts that are in use is rejected.', {
    ...nodeId, position: pointSchema.optional(), parentId: id.nullable().optional(), width: finiteSize.optional(), height: finiteSize.optional(),
    label: name.optional(), header: name.optional(), title: name.optional(), description: z.string().max(100000).optional(), body: z.string().max(100000).optional(),
    color: z.string().optional(), icon: z.string().max(100000).optional(), handleCounts: handlesSchema.optional(),
  }, async ({ diagramId, nodeId, ...patch }) => { await mutate(diagramId, (content) => updateNode(content, nodeId, patch)); return { nodeId } })

  tool('change_node_shape', 'Convert an existing box between full, logoOnly, textOnly, infoCard and annotation. Groups cannot be converted. Preserves ID, text, hidden logo, color, membership and connections; uses the same dimensions and ancestor expansion as the UI.', {
    ...nodeId, shape: shapeSchema,
  }, async ({ diagramId, nodeId, shape }) => {
    await mutate(diagramId, (content) => {
      if (requireNode(content, nodeId).type === 'group') throw new Error('Groups cannot change shape')
      content.nodes = documentNodes(changeNodeShapeLayout(content.nodes, nodeId, shape))
    }); return { nodeId, shape }
  })

  tool('fit_group', 'Explicitly fit a group to its direct children with padding. Preserves every child canvas position; empty groups are unchanged. This is the same Fit action as the UI.', nodeId,
    async ({ diagramId, nodeId }) => {
      await mutate(diagramId, (content) => {
        if (requireNode(content, nodeId).type !== 'group') throw new Error('Node is not a group')
        content.nodes = documentNodes(fitGroupContents(content.nodes, nodeId))
      }); return { nodeId }
    })

  for (const kind of ['align', 'distribute'] as const) {
    const modes = kind === 'align' ? ['left', 'hcenter', 'right', 'top', 'vmiddle', 'bottom'] as const : ['horizontal', 'vertical', 'grid'] as const
    tool(`${kind}_nodes`, `${kind} selected nodes using the same UI layout rules. Parent membership is kept; selected groups carry descendants, which are not moved twice. Distribution uses at least 40px gaps.`, {
      ...diagramId, nodeIds: z.array(id).min(kind === 'align' ? 2 : 3).max(5000), mode: z.enum(modes),
    }, async ({ diagramId, nodeIds, mode }) => {
      if (new Set(nodeIds).size !== nodeIds.length) throw new Error('Duplicate nodeIds')
      await mutate(diagramId, (content) => {
        nodeIds.forEach((id) => requireNode(content, id))
        content.nodes = documentNodes(layoutNodes(content.nodes, nodeIds, mode))
      }); return { nodeIds, mode }
    })
  }

  tool('update_connection', 'Edit a connection in place, preserving its ID. Change endpoints, cases of use, label or handles. A null handle clears the anchor for floating edges. Handle IDs are top/right/bottom/left or side-2 through side-4, if configured on that node.', {
    ...diagramId, edgeId: id, sourceSystemId: id.optional(), targetSystemId: id.optional(),
    sourceHandle: id.nullable().optional(), targetHandle: id.nullable().optional(), useCaseIds: z.array(id).optional(), label: z.string().optional(),
  }, async ({ diagramId, edgeId, ...patch }) => {
    if (!Object.values(patch).some((v) => v !== undefined)) throw new Error('Provide at least one field')
    await mutate(diagramId, (content) => {
      const edge = content.edges.find((edge) => edge.id === edgeId)
      if (!edge) throw new Error(`Unknown edgeId: ${edgeId}`)
      if (patch.sourceSystemId !== undefined) edge.source = patch.sourceSystemId
      if (patch.targetSystemId !== undefined) edge.target = patch.targetSystemId
      if (patch.sourceHandle !== undefined) edge.sourceHandle = patch.sourceHandle
      if (patch.targetHandle !== undefined) edge.targetHandle = patch.targetHandle
      if (patch.useCaseIds !== undefined) edge.data.useCaseIds = patch.useCaseIds
      if (patch.label !== undefined) edge.data.label = patch.label
      validateConnection(content, edge)
    }); return { edgeId }
  })

  tool('update_use_case', 'Edit or rename a use case by ID, preserving its connections and scenario references. Unlike set_use_case, renaming does not create another use case.', {
    ...diagramId, useCaseId: id, name: name.optional(), color: z.string().optional(), speed: speedSchema.optional(), shape: particleSchema.optional(),
  }, async ({ diagramId, useCaseId, ...patch }) => {
    if (!Object.values(patch).some((v) => v !== undefined)) throw new Error('Provide at least one field')
    await mutate(diagramId, (content) => {
      const useCase = content.useCases.find((u) => u.id === useCaseId)
      if (!useCase) throw new Error(`Unknown useCaseId: ${useCaseId}`)
      Object.assign(useCase, Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)))
    }); return { useCaseId }
  })

  tool('list_scenarios', 'Read all saved scenarios and their useCaseIds. Does not control a browser presentation.', diagramId,
    async ({ diagramId }) => ({ scenarios: (await api.get(diagramId)).content.scenarios ?? [] }), { readOnlyHint: true })
  tool('create_scenario', 'Create a saved scenario containing existing cases of use. An empty selection is allowed. Does not activate it in an open browser.', {
    ...diagramId, name, useCaseIds: z.array(id).default([]),
  }, async ({ diagramId, name, useCaseIds }) => {
    const scenarioId = `scenario-${randomUUID()}`
    await mutate(diagramId, (content) => {
      validateUseCases(content, useCaseIds)
      content.scenarios = [...(content.scenarios ?? []), { id: scenarioId, name, useCaseIds }]
    }); return { scenarioId }
  })
  tool('update_scenario', 'Rename or change the cases of use of a saved scenario by ID.', {
    ...diagramId, scenarioId: id, name: name.optional(), useCaseIds: z.array(id).optional(),
  }, async ({ diagramId, scenarioId, name, useCaseIds }) => {
    if (name === undefined && useCaseIds === undefined) throw new Error('Provide name or useCaseIds')
    await mutate(diagramId, (content) => {
      const scenario = content.scenarios?.find((s) => s.id === scenarioId)
      if (!scenario) throw new Error(`Unknown scenarioId: ${scenarioId}`)
      if (name !== undefined) scenario.name = name
      if (useCaseIds !== undefined) { validateUseCases(content, useCaseIds); scenario.useCaseIds = useCaseIds }
    }); return { scenarioId }
  })
  tool('delete_scenario', 'Delete a saved scenario without deleting its cases of use or connections.', { ...diagramId, scenarioId: id },
    async ({ diagramId, scenarioId }) => {
      await mutate(diagramId, (content) => {
        if (!content.scenarios?.some((s) => s.id === scenarioId)) throw new Error(`Unknown scenarioId: ${scenarioId}`)
        content.scenarios = content.scenarios.filter((s) => s.id !== scenarioId)
      }); return { deleted: scenarioId }
    }, { destructiveHint: true })
  tool('set_diagram_options', 'Update saved diagram view settings: connection labels and floating (centroid-to-centroid) edges. Does not change local theme or presentation state.', {
    ...diagramId, showEdgeLabels: z.boolean().optional(), floatingEdges: z.boolean().optional(),
  }, async ({ diagramId, ...patch }) => {
    if (!Object.values(patch).some((v) => v !== undefined)) throw new Error('Provide at least one setting')
    await mutate(diagramId, (content) => Object.assign(content, Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined))))
    return { diagramId, ...patch }
  })

  tool('duplicate_diagram', 'Create a separate copy of an owned diagram, including scenarios and options. Does not copy public share links.', diagramId,
    async ({ diagramId }) => api.duplicate(diagramId))
  tool('import_diagram', 'Import validated version-1 JSON, preserving IDs, groups, edges, use cases, scenarios and options. By default creates a NEW diagram (name required). To replace an existing diagram content, provide diagramId and confirmReplace: true after user confirmation; its name is kept and the replacement is undoable.', {
    name: name.optional(), content: diagramSchema, diagramId: id.optional(), confirmReplace: z.literal(true).optional(),
  }, async ({ name, content, diagramId, confirmReplace }) => {
    const imported = parseDiagram(content)
    if (diagramId !== undefined) {
      if (!confirmReplace || name !== undefined) throw new Error('Replacing content requires confirmReplace: true and no name')
      await mutate(diagramId, (current) => {
        for (const key of Object.keys(current)) delete (current as unknown as Record<string, unknown>)[key]
        Object.assign(current, imported)
      })
      return { diagramId, replaced: true }
    }
    if (!name || confirmReplace !== undefined) throw new Error('Creating an imported diagram requires name and no confirmReplace')
    return api.create(name, imported)
  }, { destructiveHint: true })
  tool('export_diagram', 'Return a filename and complete version-1 JSON content for saving as a .json file. Does not write files on the server or client.', diagramId,
    async ({ diagramId }) => { const diagram = await api.get(diagramId); return { filename: `${diagram.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100) || 'diagram'}.json`, content: diagram.content } }, { readOnlyHint: true })
  tool('delete_diagram', 'Permanently delete an owned diagram and its share links/history. NOT undoable. Only use after explicit user confirmation; confirmName must exactly match the current diagram name.', {
    ...diagramId, confirmName: name, confirmDelete: z.literal(true),
  }, async ({ diagramId, confirmName }) => {
    const diagram = await api.get(diagramId)
    if (diagram.name !== confirmName) throw new Error('Confirmation name does not match')
    await api.remove(diagramId, diagram.revision, confirmName)
    return { deleted: diagramId, recoverable: false }
  }, { destructiveHint: true })

  tool('list_share_links', 'List share links of an owned diagram, including expiry/revocation. Treat the URLs as sensitive.', diagramId,
    async ({ diagramId }) => api.listShares(diagramId), { readOnlyHint: true })
  tool('create_share_link', 'Create a public read-only link to the current diagram, usable by anyone who has the URL until expiry or revocation. Only use when the user explicitly requests sharing. Duration is an integer number of hours.', {
    ...diagramId, durationHours: z.number().int().positive(), confirmSharing: z.literal(true),
  }, async ({ diagramId, durationHours }) => {
    const link = await api.createShare(diagramId, durationHours)
    return { ...link, url: process.env.APP_BASE_URL ? new URL(link.url, process.env.APP_BASE_URL).href : link.url }
  }, { openWorldHint: true })
  tool('revoke_share_link', 'Revoke a specific public share link for an owned diagram. Does not delete the diagram.', { ...diagramId, linkId: id },
    async ({ diagramId, linkId }) => { await api.revokeShare(diagramId, linkId); return { revoked: linkId } }, { destructiveHint: true })

  tool('get_diagram_history', 'Return available MCP undo/redo counts and document revision. History is persistent, limited to 50 edits, and reset by a subsequent UI content edit.', diagramId,
    async ({ diagramId }) => api.history(diagramId), { readOnlyHint: true })
  for (const action of ['undo', 'redo'] as const) {
    tool(`${action}_diagram_change`, `${action} the latest MCP document edit (including scenarios, node edits and deletion of individual elements). Uses persistent per-diagram history across requests. Does not undo public sharing, diagram creation/deletion or the browser local history. A UI edit clears this history.`, diagramId,
      async ({ diagramId }) => {
        const diagram = await api.get(diagramId)
        return api.update(diagramId, { expectedRevision: diagram.revision, historyAction: action })
      }, { destructiveHint: true })
  }
}
