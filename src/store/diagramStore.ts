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
import type {
  AnnotationNodeData,
  ConnectionEdgeData,
  DiagramFile,
  GroupNodeData,
  InfoCardNodeData,
  NodeShape,
  Scenario,
  SystemNodeData,
  UseCase,
} from '../types'
import { ApiError, diagramsApi } from '../api/client'
import { NODE_SHAPE_SIZES } from '../utils/nodeShape'
import { changeNodeShapeLayout, layoutNodes } from '../utils/nodeLayout'
import { absolutePositionOf, findContainingGroup, fitGroupContents, resolveGroupDrop, sortNodesByHierarchy } from '../utils/nodeGrouping'

let idCounter = 0
function nextId(prefix: string) {
  idCounter += 1
  return `${prefix}-${idCounter}-${Math.floor(Math.random() * 100000)}`
}

export type SystemNode = Node<SystemNodeData | GroupNodeData | AnnotationNodeData | InfoCardNodeData>
export type ConnectionEdge = Edge<ConnectionEdgeData>
export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom'
export type DistributeMode = 'horizontal' | 'vertical' | 'grid'

const GROUP_WIDTH = 400
const GROUP_HEIGHT = 300
const ANNOTATION_WIDTH = 260
const ANNOTATION_HEIGHT = 140
const INFO_CARD_WIDTH = 300
const INFO_CARD_HEIGHT = 180

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
  particlesPaused: boolean
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
  lastKnownRevision: number | null
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
  fitGroupToContent: (id: string) => void
  toggleEdgeLabels: () => void
  toggleFloatingEdges: () => void

  setHighlightedNodes: (ids: string[]) => void
  toggleHighlightedNode: (id: string) => void
  clearHighlight: () => void
  toggleSpotlight: () => void
  toggleParticlesPause: () => void

  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  onReconnect: (oldEdge: ConnectionEdge, newConnection: Connection) => void

  addNode: (position: { x: number; y: number }, displayMode?: 'full' | 'logoOnly' | 'textOnly') => void
  addGroup: (position: { x: number; y: number }) => void
  addAnnotation: (position: { x: number; y: number }) => void
  addInfoCard: (position: { x: number; y: number }) => void
  selectNode: (id: string) => void
  changeNodeShape: (id: string, shape: NodeShape) => void
  updateNodeData: (id: string, data: Partial<SystemNodeData & GroupNodeData & AnnotationNodeData & InfoCardNodeData>) => void
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
  let resizeActive = false

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
  particlesPaused: false,
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
  lastKnownRevision: null,
  remoteChangeAvailable: false,

  openDiagram: async (id) => {
    set({ isLoading: true, isSaving: false, lastKnownRevision: null, loadError: null, diagramId: id })
    try {
      const diagram = await diagramsApi.get(id)
      if (get().diagramId !== id) return
      get().loadDiagram(diagram.content)
      set({
        diagramName: diagram.name,
        isLoading: false,
        isDirty: false,
        lastKnownUpdatedAt: diagram.updated_at,
        lastKnownRevision: diagram.revision,
        remoteChangeAvailable: false,
      })
    } catch (err) {
      if (get().diagramId !== id) return
      set({ isLoading: false, loadError: err instanceof Error ? err.message : 'Could not load diagram' })
    }
  },

  saveDiagram: async () => {
    const { diagramId, diagramName, isDirty, isSaving, lastKnownRevision, remoteChangeAvailable, toDiagramFile } = get()
    if (!diagramId || !isDirty || isSaving || remoteChangeAvailable || lastKnownRevision === null) return
    const content = toDiagramFile()
    const serialized = JSON.stringify(content)
    set({ isSaving: true })
    try {
      const diagram = await diagramsApi.update(diagramId, { name: diagramName, content, expectedRevision: lastKnownRevision })
      if (get().diagramId !== diagramId) return
      // Edits made during the request must remain dirty for the next autosave.
      const changedDuringSave = get().diagramName !== diagramName || JSON.stringify(get().toDiagramFile()) !== serialized
      set({ isSaving: false, isDirty: changedDuringSave, lastKnownUpdatedAt: diagram.updated_at, lastKnownRevision: diagram.revision, remoteChangeAvailable: false })
    } catch (error) {
      if (get().diagramId !== diagramId) return
      set({ isSaving: false, ...(error instanceof ApiError && error.status === 409 ? { remoteChangeAvailable: true } : {}) })
    }
  },

  renameDiagram: async (name) => {
    set({ diagramName: name, isDirty: true })
    await get().saveDiagram()
  },

  closeDiagram: () => {
    set({ diagramId: null, diagramName: '', isDirty: false, isSaving: false, loadError: null, lastKnownUpdatedAt: null, lastKnownRevision: null, remoteChangeAvailable: false })
    get().clearDiagram()
  },

  checkRemoteVersion: async () => {
    const { diagramId, lastKnownUpdatedAt } = get()
    if (!diagramId || !lastKnownUpdatedAt || get().isSaving) return
    try {
      const { updated_at } = await diagramsApi.getVersion(diagramId)
      if (get().diagramId !== diagramId || get().isSaving || get().lastKnownUpdatedAt !== lastKnownUpdatedAt || updated_at === lastKnownUpdatedAt) return
      if (get().isDirty) {
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
    const movingIds = new Set(nodes.filter((node) => node.dragging).map((node) => node.id))
    movingIds.add(nodeId)
    return findContainingGroup(nodes, nodeId, position, movingIds)?.id ?? null
  },

  fitGroupToContent: (id) => {
    if (get().presenting) return
    const nodes = fitGroupContents(get().nodes, id)
    if (nodes === get().nodes) return
    commit()
    set({ nodes, isDirty: true })
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

  toggleParticlesPause: () => set({ particlesPaused: !get().particlesPaused }),

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem(THEME_STORAGE_KEY, next)
    set({ theme: next })
  },

  onNodesChange: (changes) => {
    const isDragging = changes.some((c) => c.type === 'position' && c.dragging === true)
    const isDragStop = changes.some((c) => c.type === 'position' && c.dragging === false)
    const structuralChange = changes.some((c) => c.type === 'add' || c.type === 'remove')
    const isResizing = changes.some((c) => c.type === 'dimensions' && c.resizing === true)
    const isResizeStop = changes.some((c) => c.type === 'dimensions' && c.resizing === false)

    if (isResizing && !resizeActive) {
      commit()
      resizeActive = true
    } else if (isDragging && !dragActive) {
      commit()
      dragActive = true
    } else if (structuralChange) {
      commit()
    } else if (isDragStop && !dragActive && changes.some((change) => {
      if (change.type !== 'position' || !change.position) return false
      const node = get().nodes.find((candidate) => candidate.id === change.id)
      return node && (node.position.x !== change.position.x || node.position.y !== change.position.y)
    })) {
      // Keyboard moves arrive as a completed position change, without a drag-start event.
      commit()
    }
    if (isDragStop) dragActive = false
    if (isResizeStop) resizeActive = false

    const nextNodes = sortNodesByHierarchy(applyNodeChanges(changes, get().nodes) as SystemNode[])
    const finishedDragIds = new Set(
      changes
        .filter((c) => c.type === 'position' && c.dragging === false)
        .map((c) => (c as { id: string }).id),
    )

    if (finishedDragIds.size === 0) {
      const contentChanged = changes.some((c) =>
        c.type !== 'select' && (c.type !== 'dimensions' || Boolean(c.setAttributes)),
      )
      set({ nodes: nextNodes, isDirty: get().isDirty || contentChanged })
      return
    }

    set({ nodes: resolveGroupDrop(nextNodes, finishedDragIds), isDirty: true, dropTargetGroupId: null })
  },

  onEdgesChange: (changes) => {
    if (changes.some((c) => c.type === 'remove')) commit()
    set({
      edges: applyEdgeChanges(changes, get().edges) as ConnectionEdge[],
      isDirty: get().isDirty || changes.some((c) => c.type !== 'select'),
    })
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
      ...NODE_SHAPE_SIZES[displayMode ?? 'full'],
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

  addAnnotation: (position) => {
    commit()
    const node: SystemNode = {
      id: nextId('annotation'),
      type: 'annotation',
      position,
      width: ANNOTATION_WIDTH,
      height: ANNOTATION_HEIGHT,
      data: { title: 'New note' },
    }
    set({ nodes: [...get().nodes, node], isDirty: true })
  },

  addInfoCard: (position) => {
    commit()
    const node: SystemNode = {
      id: nextId('info-card'),
      type: 'infoCard',
      position,
      width: INFO_CARD_WIDTH,
      height: INFO_CARD_HEIGHT,
      data: {
        header: 'New information card',
        description: '',
        color: '#2563eb',
      },
    }
    set({ nodes: [...get().nodes, node], isDirty: true })
  },

  selectNode: (id) => {
    if (!get().nodes.some((node) => node.id === id)) return
    set({
      nodes: get().nodes.map((node) => ({ ...node, selected: node.id === id })),
      edges: get().edges.map((edge) => edge.selected ? { ...edge, selected: false } : edge),
      selectedEdgeId: null,
    })
  },

  changeNodeShape: (id, shape) => {
    if (get().presenting) return
    const nodes = changeNodeShapeLayout(get().nodes, id, shape)
    if (nodes === get().nodes) return
    commit()
    set({ nodes, isDirty: true })
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
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const removed = byId.get(id)
    const isGroup = removed?.type === 'group'
    const removedAbs = removed ? absolutePositionOf(removed, byId) : { x: 0, y: 0 }

    const survivors = isGroup
      ? nodes
          .filter((n) => n.id !== id)
          .map((n) => {
            if (n.parentId !== id) return n
            const { parentId, extent, ...rest } = n
            return { ...rest, position: { x: removedAbs.x + n.position.x, y: removedAbs.y + n.position.y } }
          })
      : nodes.filter((n) => n.id !== id)

    set({
      nodes: survivors,
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      isDirty: true,
    })
  },

  alignNodes: (ids, mode) => {
    const nodes = layoutNodes(get().nodes, ids, mode)
    if (nodes === get().nodes) return
    commit()
    set({ nodes, isDirty: true })
  },

  distributeNodes: (ids, mode) => {
    const nodes = layoutNodes(get().nodes, ids, mode)
    if (nodes === get().nodes) return
    commit()
    set({ nodes, isDirty: true })
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
    dragActive = false
    resizeActive = false
    const orderedNodes = sortNodesByHierarchy(file.nodes)

    set({
      nodes: orderedNodes.map((n) => ({
        ...n,
        type: n.type ?? 'systemBox',
        width: n.width,
        height: n.height,
        parentId: n.parentId,
        // Membership must not clamp dragging: crossing a boundary is how users leave a group.
        extent: undefined,
        expandParent: undefined,
      })),
      edges: file.edges.map((e) => ({ ...e, type: 'useCase' })),
      useCases: file.useCases,
      scenarios: file.scenarios ?? [],
      selectedEdgeId: null,
      dropTargetGroupId: null,
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
        type:
          n.type === 'group' || n.type === 'annotation' || n.type === 'infoCard'
            ? n.type
            : 'systemBox',
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
