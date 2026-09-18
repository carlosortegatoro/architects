import assert from 'node:assert/strict'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { DiagramFile, InfoCardNodeData } from '../../src/types.js'

test('MCP creates, updates, connects, and deletes information cards', async (t) => {
  process.env.JWT_SECRET = 'info-card-test-secret'

  let content: DiagramFile = {
    version: 1,
    nodes: [
      {
        id: 'group-1',
        type: 'group',
        position: { x: 100, y: 100 },
        width: 400,
        height: 300,
        data: { label: 'Platform', color: '#475569' },
      },
      {
        id: 'annotation-1',
        type: 'annotation',
        position: { x: 700, y: 100 },
        width: 260,
        height: 140,
        data: { title: 'External note' },
      },
    ],
    edges: [],
    useCases: [],
  }

  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input, init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (!url.endsWith('/api/diagrams/diagram-1')) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
    }

    if (method === 'GET') {
      return Response.json({
        id: 'diagram-1',
        name: 'MCP test',
        created_at: '2026-09-08T00:00:00.000Z',
        updated_at: '2026-09-08T00:00:00.000Z',
        content,
      })
    }

    if (method === 'PUT') {
      const patch = JSON.parse(String(init?.body)) as { content?: DiagramFile }
      if (patch.content) content = patch.content
      return Response.json({
        id: 'diagram-1',
        name: 'MCP test',
        created_at: '2026-09-08T00:00:00.000Z',
        updated_at: '2026-09-08T00:00:01.000Z',
      })
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }) as typeof fetch

  t.after(() => {
    globalThis.fetch = originalFetch
  })

  const { buildMcpServer } = await import('./server.js')
  const server = buildMcpServer({ userId: 'user-1', email: 'test@example.com', authVersion: 0 })
  const client = new Client({ name: 'info-card-test-client', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

  await server.connect(serverTransport)
  await client.connect(clientTransport)
  t.after(async () => {
    await client.close()
    await server.close()
  })

  const tools = await client.listTools()
  const toolNames = tools.tools.map((tool) => tool.name)
  assert.ok(toolNames.includes('create_info_card'))
  assert.ok(toolNames.includes('update_info_card'))

  const created = await client.callTool({
    name: 'create_info_card',
    arguments: {
      diagramId: 'diagram-1',
      header: 'Customer identity',
      description: 'Owns authentication and profile data.',
      icon: 'preset:salesforce',
      parentId: 'group-1',
      position: { x: 80, y: 70 },
    },
  })
  assert.ok(Array.isArray(created.content))
  const createdText = created.content.find(
    (item: unknown): item is { type: 'text'; text: string } =>
      typeof item === 'object' && item !== null && 'type' in item && item.type === 'text' && 'text' in item,
  )
  assert.ok(createdText)
  const { nodeId } = JSON.parse(createdText.text) as { nodeId: string }

  const card = content.nodes.find((node) => node.id === nodeId)
  assert.equal(card?.type, 'infoCard')
  assert.equal(card?.parentId, 'group-1')
  assert.deepEqual(card?.position, { x: 80, y: 70 })
  assert.equal((card?.data as InfoCardNodeData).header, 'Customer identity')
  assert.equal((card?.data as InfoCardNodeData).icon, 'preset:salesforce')
  assert.equal(content.nodes.find((node) => node.id === 'group-1')?.width, 400)
  assert.equal(content.nodes.find((node) => node.id === 'group-1')?.height, 300)

  await client.callTool({
    name: 'update_info_card',
    arguments: {
      diagramId: 'diagram-1',
      nodeId,
      header: 'Identity capability',
      description: 'Updated description',
      color: '#16a34a',
      icon: '',
    },
  })
  const updatedCard = content.nodes.find((node) => node.id === nodeId)
  assert.deepEqual(updatedCard?.data, {
    header: 'Identity capability',
    description: 'Updated description',
    color: '#16a34a',
  })

  await client.callTool({
    name: 'create_connection',
    arguments: {
      diagramId: 'diagram-1',
      sourceSystemId: nodeId,
      targetSystemId: 'annotation-1',
      label: 'Explains',
    },
  })
  assert.equal(content.edges.length, 1)
  assert.equal(content.edges[0].source, nodeId)
  assert.equal(content.edges[0].target, 'annotation-1')

  await client.callTool({
    name: 'delete_node',
    arguments: { diagramId: 'diagram-1', nodeId },
  })
  assert.equal(content.nodes.some((node) => node.id === nodeId), false)
  assert.equal(content.edges.length, 0)
})
