import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { adoptUserNodes, calculateNodePosition } from '@xyflow/system'
import type { DiagramFile } from '../src/types'
import type { SystemNode } from '../src/store/diagramStore'
import { absolutePositionOf, findContainingGroup, resolveGroupDrop } from '../src/utils/nodeGrouping'

Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } })
const { useDiagramStore: store } = await import('../src/store/diagramStore')

type FileNode = DiagramFile['nodes'][number]
function group(id: string, x: number, y: number, parentId?: string): FileNode {
  return { id, type: 'group', position: { x, y }, width: 500, height: 400, parentId, data: { label: id, color: '#475569' } }
}
function box(id: string, x: number, y: number, parentId?: string): FileNode {
  return { id, type: 'systemBox', position: { x, y }, width: 220, height: 110, parentId, data: { label: id, color: '#334155' } }
}
function load(nodes: FileNode[]) {
  store.getState().loadDiagram({ version: 1, nodes, edges: [], useCases: [], scenarios: [] })
  store.setState({ presenting: false, isDirty: false })
}
function node(id: string) { return store.getState().nodes.find((item) => item.id === id)! }
function absolute(id: string) {
  return absolutePositionOf(node(id), new Map(store.getState().nodes.map((item) => [item.id, item])))
}
function exported() { return structuredClone(store.getState().toDiagramFile()) }
function drag(positions: Record<string, { x: number; y: number }>) {
  for (const dragging of [true, false]) {
    store.getState().onNodesChange(Object.entries(positions).map(([id, position]) => ({ type: 'position', id, position, dragging })))
  }
}
function render() {
  const lookup = new Map()
  adoptUserNodes(store.getState().nodes.map((item) => ({ ...item, measured: { width: item.width, height: item.height } })), lookup, new Map())
  return lookup
}

beforeEach(() => load([]))

test('box created before group keeps its dropped canvas position in React Flow', () => {
  for (const boxFirst of [true, false]) {
    load([])
    if (boxFirst) store.getState().addNode({ x: 0, y: 0 })
    store.getState().addGroup({ x: 100, y: 200 })
    if (!boxFirst) store.getState().addNode({ x: 0, y: 0 })
    const child = store.getState().nodes.find((item) => item.type === 'systemBox')!
    const parent = store.getState().nodes.find((item) => item.type === 'group')!
    drag({ [child.id]: { x: 140, y: 270 } })
    assert.equal(node(child.id).parentId, parent.id)
    assert.deepEqual(node(child.id).position, { x: 40, y: 70 })
    const rendered = render()
    assert.deepEqual(rendered.get(child.id).internals.positionAbsolute, { x: 140, y: 270 })
    assert.deepEqual([node(parent.id).width, node(parent.id).height], [400, 300])
    assert.ok(store.getState().nodes.indexOf(node(parent.id)) < store.getState().nodes.indexOf(node(child.id)))
  }
})

test('membership changes only at drop; preview and drop choose the same innermost group', () => {
  load([{ ...group('outer', 100, 100), width: 900, height: 700 }, group('inner', 100, 100, 'outer'), box('box', 0, 0)])
  store.getState().onNodesChange([{ type: 'position', id: 'box', position: { x: 260, y: 290 }, dragging: true }])
  assert.equal(node('box').parentId, undefined)
  assert.equal(store.getState().findGroupAt('box', node('box').position), 'inner')
  store.getState().onNodesChange([{ type: 'position', id: 'box', position: node('box').position, dragging: false }])
  assert.equal(node('box').parentId, 'inner')
  assert.deepEqual(absolute('box'), { x: 260, y: 290 })
  drag({ box: { x: 80, y: 100 } })
  assert.equal(node('box').parentId, 'inner')
  assert.deepEqual(absolute('box'), { x: 280, y: 300 })
})

test('a child can cross its parent boundary, leave, transfer groups and undo in one step', () => {
  load([group('left', 100, 100), group('right', 800, 100), box('box', 40, 70, 'left')])
  const initial = exported()
  const requested = { x: 850, y: 170 }
  const calculated = calculateNodePosition({
    nodeId: 'box', nextPosition: requested, nodeLookup: render(),
    nodeExtent: [[-Infinity, -Infinity], [Infinity, Infinity]],
  })
  assert.deepEqual(calculated.positionAbsolute, requested)
  drag({ box: calculated.position })
  assert.equal(node('box').parentId, 'right')
  assert.deepEqual(absolute('box'), requested)
  assert.equal(store.getState().past.length, 1)
  const transferred = exported()
  store.getState().undo()
  assert.deepEqual(exported(), initial)
  store.getState().redo()
  assert.deepEqual(exported(), transferred)

  drag({ box: { x: 600, y: 500 } })
  assert.equal(node('box').parentId, undefined)
  assert.deepEqual(absolute('box'), { x: 1400, y: 600 })
  assert.deepEqual([node('left').width, node('right').width], [500, 500])
  store.getState().undo()
  assert.deepEqual(exported(), transferred)
})

test('partial overlap does not attach and leaving an inner group can attach to its ancestor', () => {
  load([{ ...group('outer', 100, 100), width: 1200, height: 900 }, group('inner', 100, 100, 'outer'), box('box', 50, 70, 'inner')])
  drag({ box: { x: 400, y: 80 } })
  assert.equal(node('box').parentId, 'outer')
  assert.deepEqual(absolute('box'), { x: 600, y: 280 })
  load([group('group', 100, 100), box('box', 0, 0)])
  drag({ box: { x: 90, y: 120 } })
  assert.equal(node('box').parentId, undefined)
})

test('keyboard position changes also group and undo in one step', () => {
  load([group('group', 100, 100), box('box', 90, 170)])
  const before = exported()
  store.getState().onNodesChange([{ type: 'position', id: 'box', position: { x: 100, y: 170 }, dragging: false }])
  assert.equal(node('box').parentId, 'group')
  assert.deepEqual(absolute('box'), { x: 100, y: 170 })
  assert.equal(store.getState().past.length, 1)
  store.getState().undo()
  assert.deepEqual(exported(), before)
})

test('multiple boxes attach and detach without altering their separation or group size', () => {
  load([group('group', 100, 100), box('a', 0, 0), box('b', 0, 120)])
  const initial = exported()
  drag({ a: { x: 150, y: 170 }, b: { x: 150, y: 300 } })
  assert.equal(node('a').parentId, 'group')
  assert.equal(node('b').parentId, 'group')
  assert.equal(absolute('b').y - absolute('a').y, 130)
  assert.deepEqual([node('group').width, node('group').height], [500, 400])
  assert.equal(store.getState().past.length, 1)
  store.getState().undo()
  assert.deepEqual(exported(), initial)
  store.getState().redo()
  drag({ a: { x: 700, y: 50 }, b: { x: 700, y: 180 } })
  assert.equal(node('a').parentId, undefined)
  assert.equal(node('b').parentId, undefined)
  assert.deepEqual(absolute('a'), { x: 800, y: 150 })
  assert.equal(absolute('b').y - absolute('a').y, 130)
})

test('moving a group preserves the entire subtree, including selected descendants', () => {
  load([group('inner', 40, 60, 'outer'), box('box', 50, 80, 'inner'),
    { ...group('outer', 100, 100), width: 700, height: 600 },
    { ...group('target', 1000, 1000), width: 1000, height: 900 }])
  const before = exported()
  const childOffset = node('box').position
  drag({ outer: { x: 1100, y: 1100 }, inner: { x: 40, y: 60 }, box: childOffset })
  assert.equal(node('outer').parentId, 'target')
  assert.equal(node('inner').parentId, 'outer')
  assert.equal(node('box').parentId, 'inner')
  assert.deepEqual(node('box').position, childOffset)
  assert.deepEqual(absolute('box'), { x: 1190, y: 1240 })
  assert.deepEqual(render().get('box').internals.positionAbsolute, absolute('box'))
  store.getState().undo()
  assert.deepEqual(exported(), before)
})

test('overlapping groups resolve consistently and moving groups cannot create cycles', () => {
  const nodes: SystemNode[] = [group('large', 100, 100), { ...group('small', 100, 100), width: 350, height: 240 }, box('box', 140, 170)]
  for (const ordering of [nodes, [...nodes].reverse()]) {
    assert.equal(findContainingGroup(ordering, 'box', { x: 140, y: 170 })?.id, 'small')
  }
  load([group('parent', 100, 100), { ...group('child', 0, 0, 'parent'), width: 600, height: 500 }])
  assert.equal(store.getState().findGroupAt('parent', { x: 100, y: 100 }), null)
  const identical: SystemNode[] = [group('a', 0, 0), group('b', 0, 0)]
  const resolved = resolveGroupDrop(identical, new Set(['a', 'b']))
  assert.ok(resolved.every((item) => item.parentId === undefined))
})

test('fit is explicit, preserves all content positions and has its own undo/redo', () => {
  load([group('group', 100, 100), { ...group('nested', -20, -30, 'group'), width: 250, height: 180 }, box('box', 30, 60, 'nested'), box('outside', 150, 150)])
  const before = exported()
  const childBefore = absolute('box')
  const nestedBefore = absolute('nested')
  store.getState().fitGroupToContent('group')
  assert.deepEqual(absolute('box'), childBefore)
  assert.deepEqual(absolute('nested'), nestedBefore)
  assert.deepEqual(node('nested').position, { x: 40, y: 60 })
  assert.deepEqual([node('group').width, node('group').height], [330, 280])
  assert.deepEqual(node('outside').position, { x: 150, y: 150 })
  const after = exported()
  assert.equal(store.getState().past.length, 1)
  store.getState().fitGroupToContent('group')
  assert.equal(store.getState().past.length, 1)
  store.getState().undo()
  assert.deepEqual(exported(), before)
  store.getState().redo()
  assert.deepEqual(exported(), after)
})

test('empty, missing and presentation fits are no-ops', () => {
  load([group('empty', 0, 0), group('parent', 600, 0), box('box', 50, 70, 'parent')])
  const before = exported()
  store.getState().fitGroupToContent('empty')
  store.getState().fitGroupToContent('missing')
  store.getState().fitGroupToContent('box')
  store.getState().setPresenting(true)
  store.getState().fitGroupToContent('parent')
  assert.deepEqual(exported(), before)
  assert.equal(store.getState().past.length, 0)
})

test('group membership and free dragging survive export/import with connections unchanged', () => {
  load([group('group', 100, 100), box('box', 0, 0)])
  store.setState({ edges: [{ id: 'edge', source: 'box', target: 'group', data: { useCaseIds: [] } }] })
  drag({ box: { x: 150, y: 170 } })
  const snapshot = exported()
  store.getState().loadDiagram(snapshot)
  assert.deepEqual(exported(), snapshot)
  assert.equal(node('box').extent, undefined)
  assert.equal(node('box').expandParent, undefined)
  assert.deepEqual(render().get('box').internals.positionAbsolute, { x: 150, y: 170 })
})

test('logo-only fallback and measured dimensions determine actual containment', () => {
  const nodes: SystemNode[] = [group('group', 100, 100), {
    ...box('logo', 490, 390), width: undefined, height: undefined,
    data: { label: 'Logo', color: '#334155', displayMode: 'logoOnly' },
  }]
  assert.equal(findContainingGroup(nodes, 'logo', nodes[1].position)?.id, 'group')
  nodes[1].measured = { width: 150, height: 150 }
  assert.equal(findContainingGroup(nodes, 'logo', nodes[1].position), undefined)
})
