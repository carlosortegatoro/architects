import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import type { AnnotationNodeData, DiagramFile, InfoCardNodeData, NodeShape, SystemNodeData } from '../src/types'

// Exercise the actual editor store without opening a browser or contacting the API.
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: () => null },
})
const { useDiagramStore: store } = await import('../src/store/diagramStore')
const { getNodeShape } = await import('../src/utils/nodeShape')

const SHAPES: NodeShape[] = ['full', 'logoOnly', 'textOnly', 'infoCard', 'annotation']
const handles = { top: 2, right: 3, bottom: 1, left: 4 }
const fixture: DiagramFile = {
  version: 1,
  nodes: [
    { id: 'outer', type: 'group', position: { x: 40, y: 30 }, width: 480, height: 330, data: { label: 'Platform', color: '#475569' } },
    { id: 'inner', type: 'group', parentId: 'outer', position: { x: 40, y: 60 }, width: 360, height: 230, data: { label: 'Identity', color: '#475569' } },
    {
      id: 'subject', type: 'systemBox', parentId: 'inner', position: { x: 80, y: 70 }, width: 245, height: 135,
      data: { label: 'Customer identity', description: 'Authentication\nProfile management', icon: 'preset:salesforce', color: '#16a34a', handleCounts: handles },
    },
    { id: 'other', type: 'annotation', position: { x: 750, y: 80 }, width: 260, height: 140, data: { title: 'Consumers' } },
  ],
  edges: [
    { id: 'outgoing', source: 'subject', target: 'other', sourceHandle: 'right-3', targetHandle: 'left', data: { useCaseIds: ['uc'], label: 'Profiles' } },
    { id: 'incoming', source: 'outer', target: 'subject', sourceHandle: 'bottom', targetHandle: 'left-4', data: { useCaseIds: [] } },
  ],
  useCases: [{ id: 'uc', name: 'Read profile', color: '#2563eb', speed: 'real-time', shape: 'circle' }],
  scenarios: [{ id: 'scenario', name: 'Profile', useCaseIds: ['uc'] }],
  floatingEdges: true,
}

function subject() {
  return store.getState().nodes.find((node) => node.id === 'subject')!
}

function exported() {
  return JSON.parse(JSON.stringify(store.getState().toDiagramFile())) as DiagramFile
}

function reset() {
  store.getState().loadDiagram(structuredClone(fixture))
  store.setState({ presenting: false, isDirty: false })
}

beforeEach(reset)

test('all shape conversions keep current text, hidden logos, handles, connections, position and membership', () => {
  for (const from of SHAPES) {
    for (const to of SHAPES) {
      reset()
      store.getState().changeNodeShape('subject', from)
      // Edit after converting to catch stale label/header/body aliases on the return trip.
      const name = `${from} edited`
      const text = 'New multiline\ndescription'
      const patch = from === 'annotation' ? { title: name, body: text }
        : from === 'infoCard' ? { header: name, description: text }
        : { label: name, description: text }
      store.getState().updateNodeData('subject', patch)
      store.getState().changeNodeShape('subject', to)
      const node = subject()
      const data = node.data as SystemNodeData & InfoCardNodeData & AnnotationNodeData
      assert.equal(getNodeShape(node), to)
      assert.equal(to === 'annotation' ? data.title : to === 'infoCard' ? data.header : data.label, name)
      assert.equal(to === 'annotation' ? data.body : data.description, text)
      assert.equal(data.icon, 'preset:salesforce')
      assert.equal(data.color, '#16a34a')
      assert.deepEqual(data.handleCounts, handles)
      assert.equal(node.id, 'subject')
      assert.equal(node.parentId, 'inner')
      assert.equal(node.extent, 'parent')
      assert.deepEqual(node.position, { x: 80, y: 70 })
      assert.deepEqual(exported().edges, fixture.edges)
      assert.deepEqual(exported().scenarios, fixture.scenarios)
    }
  }
})

test('each conversion is one undo step and restores custom size and all ancestor sizes exactly', () => {
  for (const shape of SHAPES.filter((value) => value !== 'full')) {
    reset()
    const before = exported()
    store.getState().changeNodeShape('subject', shape)
    const after = exported()
    assert.equal(store.getState().past.length, 1)
    store.getState().undo()
    assert.deepEqual(exported(), before)
    store.getState().redo()
    assert.deepEqual(exported(), after)
  }
})

test('growing a card inside nested groups expands its ancestors in the same operation', () => {
  store.getState().changeNodeShape('subject', 'infoCard')
  const nodes = store.getState().nodes
  const inner = nodes.find((node) => node.id === 'inner')!
  const outer = nodes.find((node) => node.id === 'outer')!
  assert.equal(inner.width, 420)
  assert.equal(inner.height, 310)
  assert.equal(outer.width, 500)
  assert.equal(outer.height, 430)
  assert.deepEqual(inner.position, { x: 40, y: 60 })
  assert.deepEqual(outer.position, { x: 40, y: 30 })
  assert.equal(store.getState().past.length, 1)
})

test('consecutive conversions undo individually; a new conversion after undo discards redo', () => {
  store.getState().changeNodeShape('subject', 'infoCard')
  const card = exported()
  store.getState().changeNodeShape('subject', 'annotation')
  store.getState().changeNodeShape('subject', 'textOnly')
  assert.equal(store.getState().past.length, 3)
  store.getState().undo()
  assert.equal(getNodeShape(subject()), 'annotation')
  store.getState().undo()
  assert.deepEqual(exported(), card)
  store.getState().changeNodeShape('subject', 'logoOnly')
  assert.equal(store.getState().future.length, 0)
  assert.equal(subject().width, 90)
  assert.equal(subject().height, 90)
})

test('same shape, groups, unknown ids and invalid destinations do not alter content or history', () => {
  const before = exported()
  store.getState().changeNodeShape('subject', 'full')
  store.getState().changeNodeShape('outer', 'annotation')
  store.getState().changeNodeShape('missing', 'infoCard')
  store.getState().changeNodeShape('subject', 'group' as NodeShape)
  store.getState().changeNodeShape('subject', '__proto__' as NodeShape)
  assert.deepEqual(exported(), before)
  assert.equal(store.getState().past.length, 0)
  assert.equal(store.getState().isDirty, false)

  store.getState().changeNodeShape('subject', 'infoCard')
  store.getState().undo()
  store.getState().changeNodeShape('subject', 'full')
  assert.equal(store.getState().future.length, 1)
})

test('shape conversion is disabled in presentation/read-only mode', () => {
  const before = exported()
  store.getState().setPresenting(true)
  store.getState().changeNodeShape('subject', 'infoCard')
  assert.deepEqual(exported(), before)
  assert.equal(store.getState().past.length, 0)
})

test('hidden text and logo survive JSON export/import before converting back', () => {
  store.getState().changeNodeShape('subject', 'annotation')
  store.getState().loadDiagram(exported())
  store.getState().changeNodeShape('subject', 'full')
  const data = subject().data as SystemNodeData
  assert.equal(data.label, 'Customer identity')
  assert.equal(data.description, 'Authentication\nProfile management')
  assert.equal(data.icon, 'preset:salesforce')
  assert.deepEqual(exported().edges, fixture.edges)
})

test('selection and automatic geometry measurements do not create edits or discard redo', () => {
  store.getState().changeNodeShape('subject', 'infoCard')
  store.getState().undo()
  store.setState({ isDirty: false })
  store.getState().selectNode('subject')
  store.getState().onNodesChange([
    { type: 'select', id: 'subject', selected: false },
    { type: 'dimensions', id: 'subject', dimensions: { width: 245, height: 135 } },
  ])
  store.getState().onEdgesChange([{ type: 'select', id: 'outgoing', selected: false }])
  assert.equal(store.getState().isDirty, false)
  assert.equal(store.getState().past.length, 0)
  assert.equal(store.getState().future.length, 1)
})

test('resize after conversion has its own undo step and never mutates the previous snapshot', () => {
  const original = exported()
  store.getState().changeNodeShape('subject', 'infoCard')
  const card = exported()
  store.getState().onNodesChange([
    { type: 'dimensions', id: 'subject', resizing: true, setAttributes: true, dimensions: { width: 310, height: 190 } },
  ])
  store.getState().onNodesChange([
    { type: 'dimensions', id: 'subject', resizing: true, setAttributes: true, dimensions: { width: 350, height: 210 } },
  ])
  store.getState().onNodesChange([{ type: 'dimensions', id: 'subject', resizing: false }])
  const resized = exported()
  assert.equal(store.getState().past.length, 2)
  store.getState().undo()
  assert.deepEqual(exported(), card)
  store.getState().undo()
  assert.deepEqual(exported(), original)
  store.getState().redo()
  store.getState().redo()
  assert.deepEqual(exported(), resized)
})
