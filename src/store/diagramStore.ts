import { create } from 'zustand'
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge as addEdgeToList,
  reconnectEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react'
import type { ConnectionEdgeData, DiagramFile, GroupNodeData, Scenario, SystemNodeData, UseCase } from '../types'
import { diagramsApi } from '../api/client'

let idCounter = 0
function nextId(prefix: string) {
  idCounter += 1
  return `${prefix}-${idCounter}-${Math.floor(Math.random() * 100000)}`
}

export type SystemNode = Node<SystemNodeData | GroupNodeData>
export type ConnectionEdge = Edge<ConnectionEdgeData>
export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom'
export type DistributeMode = 'horizontal' | 'vertical' | 'grid'

const GROUP_WIDTH = 400
const GROUP_HEIGHT = 300

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

function absolutePositionOf(node: SystemNode, byId: Map<string, SystemNode>): { x: number; y: number } {
  if (!node.parentId) return node.position
  const parent = byId.get(node.parentId)
  if (!parent) return node.position
  const parentAbs = absolutePositionOf(parent, byId)
  return { x: parentAbs.x + node.position.x, y: parentAbs.y + node.position.y }
}

type Theme = 'dark' | 'light'

type Snapshot = {
  nodes: SystemNode[]
  edges: ConnectionEdge[]
  useCases: UseCase[]
  showEdgeLabels: boolean
  floatingEdges: boolean
  scenarios: Scenario[]
}

type HistoryEntry = {
  snapshot: Snapshot
  coalesceKey: string | null
}

type DiagramState = {
  nodes: SystemNode[]
  edges: ConnectionEdge[]
  useCases: UseCase[]
  scenarios: Scenario[]
  selectedEdgeId: string | null
  presenting: boolean
  hiddenUseCaseIds: string[]
  highlightedNodeIds: string[]
  spotlightEnabled: boolean
  theme: Theme
  focusedNodeId: string | null
  dropTargetGroupId: string | null
  showEdgeLabels: boolean
  floatingEdges: boolean

  past: HistoryEntry[]
  future: HistoryEntry[]
  undo: () => void
  redo: () => void

  diagramId: string | null
  diagramName: string
  isLoading: boolean
  isDirty: boolean
  isSaving: boolean
  loadError: string | null
  lastKnownUpdatedAt: string | null
  remoteChangeAvailable: boolean

  openDiagram: (id: string) => Promise<void>
  saveDiagram: () => Promise<void>
  renameDiagram: (name: string) => Promise<void>
  closeDiagram: () => void
  checkRemoteVersion: () => Promise<void>
  reloadFromRemote: () => Promise<void>

  setPresenting: (presenting: boolean) => void
  toggleUseCaseVisibility: (id: string) => void
  toggleTheme: () => void
  setFocusedNode: (id: string | null) => void
  setDropTargetGroup: (id: string | null) => void
  findGroupAt: (nodeId: string, position: { x: number; y: number }) => string | null
  toggleEdgeLabels: () => void
  toggleFloatingEdges: () => void

  setHighlightedNodes: (ids: string[]) => void
  toggleHighlightedNode: (id: string) => void
  clearHighlight: () => void
  toggleSpotlight: () => void

  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  onReconnect: (oldEdge: ConnectionEdge, newConnection: Connection) => void

  addNode: (position: { x: number; y: number }, displayMode?: 'full' | 'logoOnly' | 'textOnly') => void
  addGroup: (position: { x: number; y: number }) => void
  updateNodeData: (id: string, data: Partial<SystemNodeData & GroupNodeData>) => void
  removeNode: (id: string) => void
  alignNodes: (ids: string[], mode: AlignMode) => void
  distributeNodes: (ids: string[], mode: DistributeMode) => void

  setSelectedEdge: (id: string | null) => void
  updateEdgeUseCases: (edgeId: string, useCaseIds: string[]) => void
  removeEdge: (id: string) => void

  addUseCase: () => void
  updateUseCase: (id: string, patch: Partial<UseCase>) => void
  removeUseCase: (id: string) => void

  addScenario: () => void
  updateScenario: (id: string, patch: Partial<Scenario>) => void
  removeScenario: (id: string) => void
  applyScenario: (id: string) => void

  loadDiagram: (file: DiagramFile) => void
  toDiagramFile: () => DiagramFile
  clearDiagram: () => void
}

const DEFAULT_USE_CASE_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2']
const THEME_STORAGE_KEY = 'architectures.theme'
const HISTORY_LIMIT = 100

function loadTheme(): Theme {
  return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
}

function snapshotOf(state: DiagramState): Snapshot {
  return {
    nodes: state.nodes,
    edges: state.edges,
    useCases: state.useCases,
    showEdgeLabels: state.showEdgeLabels,
    floatingEdges: state.floatingEdges,
    scenarios: state.scenarios,
  }
}

export const useDiagramStore = create<DiagramState>((set, get) => {
  // Records the pre-mutation snapshot before a content change is applied. Consecutive
  // commits sharing the same coalesceKey (e.g. typing into the same field) collapse into
  // one history entry instead of one per keystroke, since those fields commit on every
  // change rather than on blur.
  function commit(coalesceKey: string | null = null) {
    const state = get()
    const last = state.past[state.past.length - 1]
    if (coalesceKey !== null && last?.coalesceKey === coalesceKey) return

    const nextPast = [...state.past, { snapshot: snapshotOf(state), coalesceKey }]
    if (nextPast.length > HISTORY_LIMIT) nextPast.shift()
    set({ past: nextPast, future: [] })
  }

  // Tracks whether a node drag gesture is already in progress, so onNodesChange commits
  // once on the transition into dragging rather than on every mousemove tick (React Flow
  // reports `dragging: true` on every tick of an in-progress drag, not just the first).
  let dragActive = false

  return {
  nodes: [],
  edges: [],
  useCases: [],
  scenarios: [],
  selectedEdgeId: null,
  presenting: false,
  hiddenUseCaseIds: [],
  highlightedNodeIds: [],
  spotlightEnabled: false,
  theme: loadTheme(),
  focusedNodeId: null,
  dropTargetGroupId: null,
  showEdgeLabels: true,
  floatingEdges: false,

  past: [],
  future: [],

  undo: () => {
    const { past } = get()
    if (past.length === 0) return
    const entry = past[past.length - 1]
    const present = snapshotOf(get())
    set({
      ...entry.snapshot,
      past: past.slice(0, -1),
      future: [...get().future, { snapshot: present, coalesceKey: null }],
      isDirty: true,
    })
  },

  redo: () => {
    const { future } = get()
    if (future.length === 0) return
    const entry = future[future.length - 1]
    const present = snapshotOf(get())
    set({
      ...entry.snapshot,
      future: future.slice(0, -1),
      past: [...get().past, { snapshot: present, coalesceKey: null }],
      isDirty: true,
    })
  },

  diagramId: null,
  diagramName: '',
  isLoading: false,
  isDirty: false,
  isSaving: false,
  loadError: null,
  lastKnownUpdatedAt: null,
  remoteChangeAvailable: false,

  openDiagram: async (id) => {
    set({ isLoading: true, loadError: null, diagramId: id })
    try {
      const diagram = await diagramsApi.get(id)
      get().loadDiagram(diagram.content)
      set({
        diagramName: diagram.name,
        isLoading: false,
        isDirty: false,
        lastKnownUpdatedAt: diagram.updated_at,
        remoteChangeAvailable: false,
      })
    } catch (err) {
      set({ isLoading: false, loadError: err instanceof Error ? err.message : 'Could not load diagram' })
    }
  },

  saveDiagram: async () => {
    const { diagramId, toDiagramFile } = get()
    if (!diagramId) return
    set({ isSaving: true })
    try {
      const diagram = await diagramsApi.update(diagramId, { content: toDiagramFile() })
      set({ isSaving: false, isDirty: false, lastKnownUpdatedAt: diagram.updated_at, remoteChangeAvailable: false })
    } catch {
      set({ isSaving: false })
    }
  },

  renameDiagram: async (name) => {
    const { diagramId } = get()
    set({ diagramName: name })
    if (!diagramId) return
    await diagramsApi.update(diagramId, { name })
  },

  closeDiagram: () => {
    set({ diagramId: null, diagramName: '', isDirty: false, loadError: null, lastKnownUpdatedAt: null, remoteChangeAvailable: false })
    get().clearDiagram()
  },

  checkRemoteVersion: async () => {
    const { diagramId, lastKnownUpdatedAt, isDirty } = get()
    if (!diagramId || !lastKnownUpdatedAt) return
    try {
      const { updated_at } = await diagramsApi.getVersion(diagramId)
      if (updated_at === lastKnownUpdatedAt) return
      if (isDirty) {
        set({ remoteChangeAvailable: true })
        return
      }
      await get().openDiagram(diagramId)
    } catch {
      // Transient network/poll failure — next poll tick will retry.
    }
  },

  reloadFromRemote: async () => {
    const { diagramId } = get()
    if (!diagramId) return
    await get().openDiagram(diagramId)
  },

  setPresenting: (presenting) => set({ presenting }),
  setFocusedNode: (id) => set({ focusedNodeId: id }),
  setDropTargetGroup: (id) => set({ dropTargetGroupId: id }),

  findGroupAt: (nodeId, position) => {
    const nodes = get().nodes
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const node = byId.get(nodeId)
    if (!node) return null

    const abs = node.parentId
      ? {
          x: absolutePositionOf(byId.get(node.parentId)!, byId).x + position.x,
          y: absolutePositionOf(byId.get(node.parentId)!, byId).y + position.y,
        }
      : position
    const width = node.width ?? 220
    const height = node.height ?? 110

    const containingGroup = nodes.find(
      (g) =>
        g.type === 'group' &&
        g.id !== nodeId &&
        isInsideBounds(
          { ...abs, width, height },
          { ...absolutePositionOf(g, byId), width: g.width ?? GROUP_WIDTH, height: g.height ?? GROUP_HEIGHT },
        ),
    )

    return containingGroup?.id ?? null
  },

  toggleEdgeLabels: () => {
    commit()
    set({ showEdgeLabels: !get().showEdgeLabels, isDirty: true })
  },

  toggleFloatingEdges: () => {
    commit()
    set({ floatingEdges: !get().floatingEdges, isDirty: true })
  },

  toggleUseCaseVisibility: (id) => {
    const hidden = get().hiddenUseCaseIds
    set({
      hiddenUseCaseIds: hidden.includes(id) ? hidden.filter((uid) => uid !== id) : [...hidden, id],
    })
  },

  setHighlightedNodes: (ids) => set({ highlightedNodeIds: ids }),

  toggleHighlightedNode: (id) => {
    const highlighted = get().highlightedNodeIds
    set({
      highlightedNodeIds: highlighted.includes(id)
        ? highlighted.filter((hid) => hid !== id)
        : [...highlighted, id],
    })
  },

  clearHighlight: () => set({ highlightedNodeIds: [] }),

  toggleSpotlight: () => set({ spotlightEnabled: !get().spotlightEnabled }),

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem(THEME_STORAGE_KEY, next)
    set({ theme: next })
  },

  onNodesChange: (changes) => {
    const isDragging = changes.some((c) => c.type === 'position' && c.dragging === true)
    const isDragStop = changes.some((c) => c.type === 'position' && c.dragging === false)
    const structuralChange = changes.some((c) => c.type === 'add' || c.type === 'remove')

    if (isDragging && !dragActive) {
      commit()
      dragActive = true
    } else if (structuralChange) {
      commit()
    }
    if (isDragStop) dragActive = false

    const nextNodes = applyNodeChanges(changes, get().nodes) as SystemNode[]
    const finishedDragIds = new Set(
      changes
        .filter((c) => c.type === 'position' && c.dragging === false)
        .map((c) => (c as { id: string }).id),
    )

    if (finishedDragIds.size === 0) {
      set({ nodes: nextNodes, isDirty: true })
      return
    }

    const byId = new Map(nextNodes.map((n) => [n.id, n]))
    const groups = nextNodes.filter((n) => n.type === 'group')

    const resolved = nextNodes.map((node) => {
      if (node.type === 'group' || !finishedDragIds.has(node.id)) return node

      const abs = absolutePositionOf(node, byId)
      const width = node.width ?? 220
      const height = node.height ?? 110

      const containingGroup = groups.find(
        (g) =>
          g.id !== node.id &&
          isInsideBounds(
            { ...abs, width, height },
            { ...absolutePositionOf(g, byId), width: g.width ?? GROUP_WIDTH, height: g.height ?? GROUP_HEIGHT },
          ),
      )

      if (containingGroup) {
        if (node.parentId === containingGroup.id) return node
        const groupAbs = absolutePositionOf(containingGroup, byId)
        return {
          ...node,
          parentId: containingGroup.id,
          position: { x: abs.x - groupAbs.x, y: abs.y - groupAbs.y },
          extent: 'parent' as const,
        }
      }

      if (node.parentId) {
        const { parentId, extent, ...rest } = node
        return { ...rest, position: abs }
      }

      return node
    })

    set({ nodes: resolved, isDirty: true, dropTargetGroupId: null })
  },

  onEdgesChange: (changes) => {
    if (changes.some((c) => c.type === 'remove')) commit()
    set({ edges: applyEdgeChanges(changes, get().edges) as ConnectionEdge[], isDirty: true })
  },

  onConnect: (connection) => {
    commit()
    const newEdge: ConnectionEdge = {
      ...connection,
      id: nextId('edge'),
      type: 'useCase',
      data: { useCaseIds: [] },
    }
    set({ edges: addEdgeToList(newEdge, get().edges), isDirty: true })
  },

  onReconnect: (oldEdge, newConnection) => {
    commit()
    set({ edges: reconnectEdge(oldEdge, newConnection, get().edges), isDirty: true })
  },

  addNode: (position, displayMode) => {
    commit()
    const node: SystemNode = {
      id: nextId('node'),
      type: 'systemBox',
      position,
      width: 220,
      height: 110,
      data: { label: 'New system', color: '#334155', ...(displayMode && displayMode !== 'full' ? { displayMode } : {}) },
    }
    set({ nodes: [...get().nodes, node], isDirty: true })
  },

  addGroup: (position) => {
    commit()
    const node: SystemNode = {
      id: nextId('group'),
      type: 'group',
      position,
      width: GROUP_WIDTH,
      height: GROUP_HEIGHT,
      zIndex: -1,
      data: { label: 'New group', color: '#475569' },
    }
    set({ nodes: [...get().nodes, node], isDirty: true })
  },

  updateNodeData: (id, data) => {
    const fieldKey = Object.keys(data).sort().join(',')
    commit(`node:${id}:${fieldKey}`)
    set({
      nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n)),
      isDirty: true,
    })
  },

  removeNode: (id) => {
    commit()
    const nodes = get().nodes
    const removed = nodes.find((n) => n.id === id)
    const isGroup = removed?.type === 'group'

    const survivors = isGroup
      ? nodes
          .filter((n) => n.id !== id)
          .map((n) => {
            if (n.parentId !== id) return n
            const parentAbs = removed?.position ?? { x: 0, y: 0 }
            const { parentId, extent, ...rest } = n
            return { ...rest, position: { x: parentAbs.x + n.position.x, y: parentAbs.y + n.position.y } }
          })
      : nodes.filter((n) => n.id !== id)

    set({
      nodes: survivors,
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      isDirty: true,
    })
  },

  alignNodes: (ids, mode) => {
    if (ids.length < 2) return
    commit()

    const nodes = get().nodes
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const targets = ids.map((id) => byId.get(id)).filter((n): n is SystemNode => n !== undefined)
    if (targets.length < 2) return

    const boundsOf = (n: SystemNode) => {
      const abs = absolutePositionOf(n, byId)
      const width = n.width ?? (n.type === 'group' ? GROUP_WIDTH : 220)
      const height = n.height ?? (n.type === 'group' ? GROUP_HEIGHT : 110)
      return { ...abs, width, height }
    }

    const boundsById = new Map(targets.map((n) => [n.id, boundsOf(n)]))
    const minX = Math.min(...targets.map((n) => boundsById.get(n.id)!.x))
    const maxX = Math.max(...targets.map((n) => { const b = boundsById.get(n.id)!; return b.x + b.width }))
    const minY = Math.min(...targets.map((n) => boundsById.get(n.id)!.y))
    const maxY = Math.max(...targets.map((n) => { const b = boundsById.get(n.id)!; return b.y + b.height }))

    const targetIds = new Set(ids)
    const resolved = nodes.map((node) => {
      if (!targetIds.has(node.id)) return node
      const bounds = boundsById.get(node.id)!
      let abs = { x: bounds.x, y: bounds.y }
      switch (mode) {
        case 'left': abs = { ...abs, x: minX }; break
        case 'hcenter': abs = { ...abs, x: (minX + maxX) / 2 - bounds.width / 2 }; break
        case 'right': abs = { ...abs, x: maxX - bounds.width }; break
        case 'top': abs = { ...abs, y: minY }; break
        case 'vmiddle': abs = { ...abs, y: (minY + maxY) / 2 - bounds.height / 2 }; break
        case 'bottom': abs = { ...abs, y: maxY - bounds.height }; break
      }
      if (!node.parentId) return { ...node, position: abs }
      const parent = byId.get(node.parentId)
      if (!parent) return { ...node, position: abs }
      const parentAbs = absolutePositionOf(parent, byId)
      return { ...node, position: { x: abs.x - parentAbs.x, y: abs.y - parentAbs.y } }
    })

    set({ nodes: resolved, isDirty: true })
  },

  distributeNodes: (ids, mode) => {
    if (ids.length < 3) return
    commit()

    const nodes = get().nodes
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const targets = ids.map((id) => byId.get(id)).filter((n): n is SystemNode => n !== undefined)
    if (targets.length < 3) return

    const boundsOf = (n: SystemNode) => {
      const abs = absolutePositionOf(n, byId)
      const width = n.width ?? (n.type === 'group' ? GROUP_WIDTH : 220)
      const height = n.height ?? (n.type === 'group' ? GROUP_HEIGHT : 110)
      return { ...abs, width, height }
    }

    const boundsById = new Map(targets.map((n) => [n.id, boundsOf(n)]))
    const targetIds = new Set(ids)

    function applyAbs(node: SystemNode, abs: { x: number; y: number }): SystemNode {
      if (!node.parentId) return { ...node, position: abs }
      const parent = byId.get(node.parentId)
      if (!parent) return { ...node, position: abs }
      const parentAbs = absolutePositionOf(parent, byId)
      return { ...node, position: { x: abs.x - parentAbs.x, y: abs.y - parentAbs.y } }
    }

    const newAbsById = new Map<string, { x: number; y: number }>()

    if (mode === 'grid') {
      const cols = Math.max(1, Math.round(Math.sqrt(targets.length)))
      const GAP = 40

      const sorted = [...targets].sort((a, b) => {
        const ba = boundsById.get(a.id)!
        const bb = boundsById.get(b.id)!
        return ba.y - bb.y || ba.x - bb.x
      })

      const cellWidth = Math.max(...targets.map((n) => boundsById.get(n.id)!.width))
      const cellHeight = Math.max(...targets.map((n) => boundsById.get(n.id)!.height))
      const originX = Math.min(...targets.map((n) => boundsById.get(n.id)!.x))
      const originY = Math.min(...targets.map((n) => boundsById.get(n.id)!.y))

      sorted.forEach((n, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        newAbsById.set(n.id, {
          x: originX + col * (cellWidth + GAP),
          y: originY + row * (cellHeight + GAP),
        })
      })
    } else {
      const axis: 'x' | 'y' = mode === 'horizontal' ? 'x' : 'y'
      const size: 'width' | 'height' = mode === 'horizontal' ? 'width' : 'height'

      const MIN_GAP = 40

      const sorted = [...targets].sort((a, b) => boundsById.get(a.id)![axis] - boundsById.get(b.id)![axis])
      const first = boundsById.get(sorted[0].id)!
      const last = boundsById.get(sorted[sorted.length - 1].id)!
      const span = (last[axis] + last[size]) - first[axis]
      const totalSize = sorted.reduce((sum, n) => sum + boundsById.get(n.id)![size], 0)
      const gap = Math.max(MIN_GAP, (span - totalSize) / (sorted.length - 1))

      let cursor = first[axis]
      sorted.forEach((n) => {
        const b = boundsById.get(n.id)!
        newAbsById.set(n.id, axis === 'x' ? { x: cursor, y: b.y } : { x: b.x, y: cursor })
        cursor += b[size] + gap
      })
    }

    const resolved = nodes.map((node) => {
      if (!targetIds.has(node.id)) return node
      return applyAbs(node, newAbsById.get(node.id)!)
    })

    set({ nodes: resolved, isDirty: true })
  },

  setSelectedEdge: (id) => set({ selectedEdgeId: id }),

  updateEdgeUseCases: (edgeId, useCaseIds) => {
    commit()
    set({
      edges: get().edges.map((e) =>
        e.id === edgeId ? { ...e, data: { ...e.data, useCaseIds } } : e,
      ),
      isDirty: true,
    })
  },

  removeEdge: (id) => {
    commit()
    set({
      edges: get().edges.filter((e) => e.id !== id),
      selectedEdgeId: get().selectedEdgeId === id ? null : get().selectedEdgeId,
      isDirty: true,
    })
  },

  addUseCase: () => {
    commit()
    const useCases = get().useCases
    const color = DEFAULT_USE_CASE_COLORS[useCases.length % DEFAULT_USE_CASE_COLORS.length]
    const useCase: UseCase = {
      id: nextId('usecase'),
      name: `Use case ${useCases.length + 1}`,
      color,
      speed: 'near-real-time',
      shape: 'circle',
    }
    set({ useCases: [...useCases, useCase], isDirty: true })
  },

  updateUseCase: (id, patch) => {
    const fieldKey = Object.keys(patch).sort().join(',')
    commit(`usecase:${id}:${fieldKey}`)
    set({
      useCases: get().useCases.map((u) => (u.id === id ? { ...u, ...patch } : u)),
      isDirty: true,
    })
  },

  removeUseCase: (id) => {
    commit()
    set({
      useCases: get().useCases.filter((u) => u.id !== id),
      edges: get().edges.map((e) => ({
        ...e,
        data: { ...e.data, useCaseIds: (e.data?.useCaseIds ?? []).filter((uid) => uid !== id) },
      })),
      scenarios: get().scenarios.map((s) => ({
        ...s,
        useCaseIds: s.useCaseIds.filter((uid) => uid !== id),
      })),
      isDirty: true,
    })
  },

  addScenario: () => {
    commit()
    const scenarios = get().scenarios
    const scenario: Scenario = {
      id: nextId('scenario'),
      name: `Scenario ${scenarios.length + 1}`,
      useCaseIds: [],
    }
    set({ scenarios: [...scenarios, scenario], isDirty: true })
  },

  updateScenario: (id, patch) => {
    const fieldKey = Object.keys(patch).sort().join(',')
    commit(`scenario:${id}:${fieldKey}`)
    set({
      scenarios: get().scenarios.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      isDirty: true,
    })
  },

  removeScenario: (id) => {
    commit()
    set({
      scenarios: get().scenarios.filter((s) => s.id !== id),
      isDirty: true,
    })
  },

  applyScenario: (id) => {
    const scenario = get().scenarios.find((s) => s.id === id)
    if (!scenario) return
    const allUseCaseIds = get().useCases.map((u) => u.id)
    set({
      hiddenUseCaseIds: allUseCaseIds.filter((uid) => !scenario.useCaseIds.includes(uid)),
    })
  },

  loadDiagram: (file) => {
    const orderedNodes = [...file.nodes].sort((a, b) => {
      if (a.type === 'group' && b.type !== 'group') return -1
      if (a.type !== 'group' && b.type === 'group') return 1
      return 0
    })

    set({
      nodes: orderedNodes.map((n) => ({
        ...n,
        type: n.type ?? 'systemBox',
        width: n.width,
        height: n.height,
        parentId: n.parentId,
        extent: n.parentId ? ('parent' as const) : undefined,
      })),
      edges: file.edges.map((e) => ({ ...e, type: 'useCase' })),
      useCases: file.useCases,
      scenarios: file.scenarios ?? [],
      selectedEdgeId: null,
      showEdgeLabels: file.showEdgeLabels ?? true,
      floatingEdges: file.floatingEdges ?? false,
      highlightedNodeIds: [],
      past: [],
      future: [],
    })
  },

  toDiagramFile: () => {
    const { nodes, edges, useCases, showEdgeLabels, floatingEdges, scenarios } = get()
    return {
      version: 1,
      showEdgeLabels,
      floatingEdges,
      scenarios,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type === 'group' ? 'group' : 'systemBox',
        position: n.position,
        data: n.data,
        width: n.width,
        height: n.height,
        parentId: n.parentId,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        data: e.data ?? { useCaseIds: [] },
      })),
      useCases,
    }
  },

  clearDiagram: () =>
    set({
      nodes: [],
      edges: [],
      useCases: [],
      scenarios: [],
      selectedEdgeId: null,
      hiddenUseCaseIds: [],
      highlightedNodeIds: [],
      showEdgeLabels: true,
      floatingEdges: false,
      past: [],
      future: [],
    }),
  }
})
