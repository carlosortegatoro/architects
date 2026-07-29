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
import type { ConnectionEdgeData, DiagramFile, GroupNodeData, SystemNodeData, UseCase } from '../types'
import { diagramsApi } from '../api/client'

let idCounter = 0
function nextId(prefix: string) {
  idCounter += 1
  return `${prefix}-${idCounter}-${Math.floor(Math.random() * 100000)}`
}

export type SystemNode = Node<SystemNodeData | GroupNodeData>
export type ConnectionEdge = Edge<ConnectionEdgeData>

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

type Theme = 'dark' | 'light'

type DiagramState = {
  nodes: SystemNode[]
  edges: ConnectionEdge[]
  useCases: UseCase[]
  selectedEdgeId: string | null
  presenting: boolean
  hiddenUseCaseIds: string[]
  theme: Theme
  focusedNodeId: string | null

  diagramId: string | null
  diagramName: string
  isLoading: boolean
  isDirty: boolean
  isSaving: boolean
  loadError: string | null

  openDiagram: (id: string) => Promise<void>
  saveDiagram: () => Promise<void>
  renameDiagram: (name: string) => Promise<void>
  closeDiagram: () => void

  setPresenting: (presenting: boolean) => void
  toggleUseCaseVisibility: (id: string) => void
  toggleTheme: () => void
  setFocusedNode: (id: string | null) => void

  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  onReconnect: (oldEdge: ConnectionEdge, newConnection: Connection) => void

  addNode: (position: { x: number; y: number }) => void
  addGroup: (position: { x: number; y: number }) => void
  updateNodeData: (id: string, data: Partial<SystemNodeData & GroupNodeData>) => void
  removeNode: (id: string) => void

  setSelectedEdge: (id: string | null) => void
  updateEdgeUseCases: (edgeId: string, useCaseIds: string[]) => void
  removeEdge: (id: string) => void

  addUseCase: () => void
  updateUseCase: (id: string, patch: Partial<UseCase>) => void
  removeUseCase: (id: string) => void

  loadDiagram: (file: DiagramFile) => void
  toDiagramFile: () => DiagramFile
  clearDiagram: () => void
}

const DEFAULT_USE_CASE_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2']
const THEME_STORAGE_KEY = 'architectures.theme'

function loadTheme(): Theme {
  return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
}

export const useDiagramStore = create<DiagramState>((set, get) => ({
  nodes: [],
  edges: [],
  useCases: [],
  selectedEdgeId: null,
  presenting: false,
  hiddenUseCaseIds: [],
  theme: loadTheme(),
  focusedNodeId: null,

  diagramId: null,
  diagramName: '',
  isLoading: false,
  isDirty: false,
  isSaving: false,
  loadError: null,

  openDiagram: async (id) => {
    set({ isLoading: true, loadError: null, diagramId: id })
    try {
      const diagram = await diagramsApi.get(id)
      get().loadDiagram(diagram.content)
      set({ diagramName: diagram.name, isLoading: false, isDirty: false })
    } catch (err) {
      set({ isLoading: false, loadError: err instanceof Error ? err.message : 'Could not load diagram' })
    }
  },

  saveDiagram: async () => {
    const { diagramId, toDiagramFile } = get()
    if (!diagramId) return
    set({ isSaving: true })
    try {
      await diagramsApi.update(diagramId, { content: toDiagramFile() })
      set({ isSaving: false, isDirty: false })
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
    set({ diagramId: null, diagramName: '', isDirty: false, loadError: null })
    get().clearDiagram()
  },

  setPresenting: (presenting) => set({ presenting }),
  setFocusedNode: (id) => set({ focusedNodeId: id }),

  toggleUseCaseVisibility: (id) => {
    const hidden = get().hiddenUseCaseIds
    set({
      hiddenUseCaseIds: hidden.includes(id) ? hidden.filter((uid) => uid !== id) : [...hidden, id],
    })
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem(THEME_STORAGE_KEY, next)
    set({ theme: next })
  },

  onNodesChange: (changes) => {
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

    function absolutePosition(node: SystemNode): { x: number; y: number } {
      if (!node.parentId) return node.position
      const parent = byId.get(node.parentId)
      if (!parent) return node.position
      const parentAbs = absolutePosition(parent)
      return { x: parentAbs.x + node.position.x, y: parentAbs.y + node.position.y }
    }

    const resolved = nextNodes.map((node) => {
      if (node.type === 'group' || !finishedDragIds.has(node.id)) return node

      const abs = absolutePosition(node)
      const width = node.width ?? 220
      const height = node.height ?? 110

      const containingGroup = groups.find(
        (g) =>
          g.id !== node.id &&
          isInsideBounds(
            { ...abs, width, height },
            { ...absolutePosition(g), width: g.width ?? GROUP_WIDTH, height: g.height ?? GROUP_HEIGHT },
          ),
      )

      if (containingGroup) {
        if (node.parentId === containingGroup.id) return node
        const groupAbs = absolutePosition(containingGroup)
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

    set({ nodes: resolved, isDirty: true })
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) as ConnectionEdge[], isDirty: true })
  },

  onConnect: (connection) => {
    const newEdge: ConnectionEdge = {
      ...connection,
      id: nextId('edge'),
      type: 'useCase',
      data: { useCaseIds: [] },
    }
    set({ edges: addEdgeToList(newEdge, get().edges), isDirty: true })
  },

  onReconnect: (oldEdge, newConnection) => {
    set({ edges: reconnectEdge(oldEdge, newConnection, get().edges), isDirty: true })
  },

  addNode: (position) => {
    const node: SystemNode = {
      id: nextId('node'),
      type: 'systemBox',
      position,
      width: 220,
      height: 110,
      data: { label: 'New system', color: '#334155' },
    }
    set({ nodes: [...get().nodes, node], isDirty: true })
  },

  addGroup: (position) => {
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
    set({
      nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n)),
      isDirty: true,
    })
  },

  removeNode: (id) => {
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

  setSelectedEdge: (id) => set({ selectedEdgeId: id }),

  updateEdgeUseCases: (edgeId, useCaseIds) => {
    set({
      edges: get().edges.map((e) =>
        e.id === edgeId ? { ...e, data: { ...e.data, useCaseIds } } : e,
      ),
      isDirty: true,
    })
  },

  removeEdge: (id) => {
    set({
      edges: get().edges.filter((e) => e.id !== id),
      selectedEdgeId: get().selectedEdgeId === id ? null : get().selectedEdgeId,
      isDirty: true,
    })
  },

  addUseCase: () => {
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
    set({
      useCases: get().useCases.map((u) => (u.id === id ? { ...u, ...patch } : u)),
      isDirty: true,
    })
  },

  removeUseCase: (id) => {
    set({
      useCases: get().useCases.filter((u) => u.id !== id),
      edges: get().edges.map((e) => ({
        ...e,
        data: { ...e.data, useCaseIds: (e.data?.useCaseIds ?? []).filter((uid) => uid !== id) },
      })),
      isDirty: true,
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
      selectedEdgeId: null,
    })
  },

  toDiagramFile: () => {
    const { nodes, edges, useCases } = get()
    return {
      version: 1,
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
    set({ nodes: [], edges: [], useCases: [], selectedEdgeId: null, hiddenUseCaseIds: [] }),
}))
